// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// Digistore24 IPN endpoint — Next.js App Router (Node runtime).
// Drop this in as app/api/ipn/route.ts.
//
// TWO FILES, AND THE DIFFERENCE MATTERS:
//   ./signature-node.mjs  — the signature. Copy it verbatim, never edit it.
//   this file             — the endpoint. An EXAMPLE. Adapt it to your app.
//
// The algorithm and the reasoning are in ../references/ipn-protocol.md; the
// event semantics are in ../references/events.md.

import { verifyIpnSignature } from "./signature-node.mjs";

// The Node runtime, not the edge one: node:crypto is not available on edge
// (use signature-web.mjs there). force-dynamic so this route is never
// statically optimised away.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IpnParams = Record<string, string>;

/** Digistore24 validates a newly registered endpoint with a GET. */
export async function GET() {
  return new Response("OK", { status: 200 });
}

export async function POST(request: Request) {
  const passphrase = process.env.DIGISTORE_IPN_PASSPHRASE ?? "";

  // The RAW body, parsed here. Never a framework's re-serialised object: the
  // signature covers the bytes that were sent. Digistore24 posts
  // application/x-www-form-urlencoded, not JSON.
  const raw = await request.text();
  const params: IpnParams = Object.fromEntries(new URLSearchParams(raw));

  if (!verifyIpnSignature(params, passphrase)) {
    // 403, and nothing about WHY. A caller who is guessing must not learn
    // whether the passphrase is missing or the signature is merely wrong.
    return new Response("invalid signature", { status: 403 });
  }

  const event = params["event"] || params["order_event"] || "";

  // Answer the connection test without touching anything.
  if (event === "connection_test") return new Response("OK", { status: 200 });

  // Store the raw payload BEFORE acting on it — see ipn-protocol.md.
  await recordRawIpn(raw, params);

  try {
    await handleEvent(event, params);
  } catch (err) {
    // Never throw out of here: Digistore24 retries until it gets a 200, so an
    // exception becomes an endless redelivery loop. The raw row above is what
    // you replay from.
    console.error("[ipn] handler failed", { event, orderId: params["order_id"], err });
  }

  return new Response("OK", { status: 200 });
}

// --- What you implement ------------------------------------------------------
//
// Everything above is protocol and is the same in every app. Everything below
// depends on your data model. See ../references/events.md for the semantics and
// the ds24-entitlements skill for the access record itself.

async function recordRawIpn(_raw: string, _params: IpnParams): Promise<void> {
  throw new Error("TODO: store the raw payload verbatim, keyed on order_id + event");
}

async function handleEvent(event: string, params: IpnParams): Promise<void> {
  const orderId = params["order_id"] ?? "";
  const productId = params["product_id"] ?? "";

  // Idempotency: this exact event for this exact order may already have been
  // processed. Digistore24 retries until it gets a 200 — including after a
  // timeout that followed a successful write. Enforce it with a UNIQUE
  // constraint on (order_id, event), not with a SELECT-then-INSERT, which two
  // concurrent redeliveries walk straight through.
  if (await alreadyProcessed(orderId, event)) return;

  switch (event) {
    case "on_payment":
    case "on_payment_subscription_signup":
      // Grants access — and LIFTS a suspension if one is in place. Those are
      // two different writes: an insert-if-absent writes nothing for a row
      // that already exists, so the suspension would survive the payment that
      // answered it, and a customer who just paid stays locked out.
      await grantOrResumeAccess(orderId, productId);
      break;

    case "on_refund":
      await endAccess(orderId, productId, "refund");
      break;
    case "on_chargeback":
      await endAccess(orderId, productId, "chargeback");
      break;

    case "on_payment_missed":
      // Reversible. Suspended, never ended — an expired card is not a
      // cancellation.
      await suspendAccess(orderId, productId);
      break;
    case "on_rebill_resumed":
      // Lifts a suspension and NOTHING else. It is a support click with no
      // payment behind it, so it must never create access.
      await resumeAccess(orderId, productId);
      break;

    case "on_rebill_cancelled":
      // Deliberately nothing: billing stopped, access runs to the end of the
      // paid period. Ending it here takes away time the customer paid for.
      // See events.md — this case and the next one only make sense as a pair.
      break;
    case "last_paid_day":
      await endAccess(orderId, productId, "lastPaidDay");
      break;

    default:
      // Unknown events are accepted and ignored. Do not throw.
      break;
  }

  await markProcessed(orderId, event);
}

declare function alreadyProcessed(orderId: string, event: string): Promise<boolean>;
declare function markProcessed(orderId: string, event: string): Promise<void>;
/** Must also clear a suspension on a row that already exists. */
declare function grantOrResumeAccess(orderId: string, productId: string): Promise<void>;
declare function suspendAccess(orderId: string, productId: string): Promise<void>;
/** Lifts a suspension only — never creates a row. */
declare function resumeAccess(orderId: string, productId: string): Promise<void>;
/** Must be a no-op on a row that has already ended: ended is forever. */
declare function endAccess(
  orderId: string,
  productId: string,
  reason: "refund" | "chargeback" | "lastPaidDay",
): Promise<void>;
