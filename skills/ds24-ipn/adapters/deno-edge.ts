// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// Digistore24 IPN endpoint — Deno / Supabase Edge Function.
// This is the adapter for Lovable Cloud, and for any Supabase project.
// Drop this in as supabase/functions/ds24-ipn/index.ts.
//
// TWO FILES, AND THE DIFFERENCE MATTERS:
//   ./signature-web.mjs  — the signature. Copy it verbatim, never edit it.
//   this file            — the endpoint. An EXAMPLE. Adapt it to your app.
//
// ┌─ THREE THINGS THAT ARE NOT OPTIONAL HERE ─────────────────────────────────┐
// │                                                                           │
// │ 1. DEPLOY IT WITH verify_jwt = false.                                     │
// │    Digistore24 does not send a Supabase JWT. With the default on, every   │
// │    IPN gets a 401 before this code runs, and every purchase silently      │
// │    fails to unlock anything — with no error anywhere in your app.         │
// │    In supabase/config.toml:                                              │
// │                                                                           │
// │        [functions.ds24-ipn]                                               │
// │        verify_jwt = false                                                 │
// │                                                                           │
// │    (or `supabase functions deploy ds24-ipn --no-verify-jwt`)              │
// │                                                                           │
// │    The endpoint is then genuinely public — which is why the signature     │
// │    check is the ONLY thing protecting it, and why none of it may be       │
// │    softened.                                                              │
// │                                                                           │
// │ 2. THERE IS NO node:crypto HERE. Web Crypto is async, so verifying is     │
// │    `await verifyIpnSignature(...)`. Forgetting the await yields a         │
// │    Promise, which is truthy, which accepts every payload.                 │
// │                                                                           │
// │ 3. USE THE SERVICE ROLE KEY for the writes. The caller is Digistore24,    │
// │    not a signed-in user, so there is no session for row-level security    │
// │    to work from. Keep RLS on for your normal tables and let this function │
// │    be the one thing that bypasses it.                                    │
// └───────────────────────────────────────────────────────────────────────────┘
//
// The algorithm and the reasoning are in ../references/ipn-protocol.md; the
// event semantics are in ../references/events.md.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyIpnSignature } from "./signature-web.mjs";

type IpnParams = Record<string, string>;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  // Service role: there is no user session on this path. See note 3 above.
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  // Digistore24 validates a newly registered endpoint with a GET.
  if (req.method === "GET") return new Response("OK", { status: 200 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const passphrase = Deno.env.get("DIGISTORE_IPN_PASSPHRASE") ?? "";

  // The RAW body, parsed here. Digistore24 posts form-encoded, not JSON.
  const raw = await req.text();
  const params: IpnParams = Object.fromEntries(new URLSearchParams(raw));

  // The await is load-bearing — see note 2 above.
  if (!(await verifyIpnSignature(params, passphrase))) {
    // 403, and nothing about why.
    return new Response("invalid signature", { status: 403 });
  }

  const event = params["event"] || params["order_event"] || "";
  if (event === "connection_test") return new Response("OK", { status: 200 });

  // Store the raw payload BEFORE acting on it.
  await supabase.from("ipn_events").insert({
    event,
    order_id: params["order_id"] ?? null,
    raw,
  });

  try {
    await handleEvent(event, params);
  } catch (err) {
    // Never throw out of here: Digistore24 retries until it gets a 200, so an
    // exception becomes an endless redelivery loop. The raw row above is what
    // you replay from.
    console.error("[ipn] handler failed", event, params["order_id"], err);
  }

  return new Response("OK", { status: 200 });
});

// --- What you implement ------------------------------------------------------
//
// Everything above is protocol. Below is your data model — see
// ../references/events.md for the semantics.
//
// The table this example assumes:
//
//   create table access_grants (
//     order_id      text not null,
//     product_id    text not null,
//     suspended_at  timestamptz,
//     ended_at      timestamptz,
//     ended_reason  text,
//     primary key (order_id, product_id)
//   );
//   create table ipn_processed (
//     order_id text not null, event text not null,
//     primary key (order_id, event)          -- this IS the idempotency
//   );

async function handleEvent(event: string, params: IpnParams): Promise<void> {
  const orderId = params["order_id"] ?? "";
  const productId = params["product_id"] ?? "";

  // Idempotency through the primary key, not through a SELECT followed by an
  // INSERT — two concurrent redeliveries walk straight through that.
  const { error: seen } = await supabase
    .from("ipn_processed")
    .insert({ order_id: orderId, event });
  if (seen) return; // already handled

  switch (event) {
    case "on_payment":
    case "on_payment_subscription_signup":
      // Grants access — and LIFTS a suspension. `suspended_at: null` in the
      // upsert is what does the lifting; an insert-only would leave a paying
      // customer suspended.
      await supabase.from("access_grants").upsert(
        { order_id: orderId, product_id: productId, suspended_at: null },
        { onConflict: "order_id,product_id" },
      );
      break;

    case "on_refund":
      await endAccess(orderId, "refund");
      break;
    case "on_chargeback":
      await endAccess(orderId, "chargeback");
      break;

    case "on_payment_missed":
      // Reversible: suspended, never ended.
      await supabase
        .from("access_grants")
        .update({ suspended_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .is("ended_at", null);
      break;

    case "on_rebill_resumed":
      // Lifts a suspension and NOTHING else — no upsert, so it can never
      // create a row for a purchase that has none.
      await supabase
        .from("access_grants")
        .update({ suspended_at: null })
        .eq("order_id", orderId)
        .is("ended_at", null);
      break;

    case "on_rebill_cancelled":
      // Deliberately nothing: billing stopped, access runs on.
      break;

    case "last_paid_day":
      await endAccess(orderId, "lastPaidDay");
      break;

    default:
      break;
  }
}

async function endAccess(
  orderId: string,
  reason: "refund" | "chargeback" | "lastPaidDay",
): Promise<void> {
  // `.is("ended_at", null)` is the other half of "ended is forever": this
  // update decides on the row as it is right now, and a concurrent redelivery
  // may have ended it since. It also keeps a refund's reason from being
  // overwritten by a later last_paid_day.
  await supabase
    .from("access_grants")
    .update({ ended_at: new Date().toISOString(), ended_reason: reason })
    .eq("order_id", orderId)
    .is("ended_at", null);
}
