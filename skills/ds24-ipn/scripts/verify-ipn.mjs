#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// verify-ipn.mjs — proves that an app's Digistore24 IPN endpoint is correct.
//
// It knows nothing about your stack. It speaks HTTP and it knows the
// passphrase, so it runs against a Supabase Edge Function on Lovable Cloud
// exactly as it runs against a Next.js route on Replit or a FastAPI service
// anywhere else.
//
// Two halves:
//
//   SIGNATURE   sent against the live endpoint. A tampered payload must be
//               rejected, a missing signature must be rejected, both key-case
//               conventions must be accepted. Needs nothing but --url.
//
//   ACCESS      what the events did to the customer's access. Only checkable
//               if the app can be asked, so this half needs --probe: a small,
//               token-protected endpoint that answers "does order X currently
//               have access?". Without it these checks are SKIPPED and said to
//               be skipped — never quietly passed.
//
// Usage:
//   node verify-ipn.mjs --url https://app.example.com/api/ipn \
//                       --passphrase "$DIGISTORE_IPN_PASSPHRASE" \
//                       [--probe https://app.example.com/api/ds24-selftest] \
//                       [--probe-token SECRET] \
//                       [--product-id 512345] [--json]
//
//   node verify-ipn.mjs --self-test        # vectors only, no network
//
// The probe endpoint you build for this is TEMPORARY. Delete it when the run
// is green; it is a debugging aid, not a feature.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// The SHIPPED implementation, not a copy of it. So the vector self-test below
// proves the file your app is meant to use, rather than a second one that
// could quietly disagree with it.
import { digistoreShaSign } from "../adapters/signature-node.mjs";

// ── arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const URL_ = flag("url");
const PASSPHRASE = flag("passphrase") ?? process.env.DIGISTORE_IPN_PASSPHRASE ?? "";
const PROBE = flag("probe");
const PROBE_TOKEN = flag("probe-token") ?? process.env.DS24_PROBE_TOKEN ?? "";
const PRODUCT_ID = flag("product-id", "999999");
const AS_JSON = has("json");
const SELF_TEST_ONLY = has("self-test");

if (has("help") || (!URL_ && !SELF_TEST_ONLY)) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n")
    .filter((l) => l.startsWith("//")).slice(2, 32).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(has("help") ? 0 : 2);
}

// ── reporting ────────────────────────────────────────────────────────────────

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, status: ok === null ? "SKIP" : ok ? "PASS" : "FAIL", detail });
  if (!AS_JSON) {
    const mark = ok === null ? "○ SKIP" : ok ? "✓ PASS" : "✗ FAIL";
    console.log(`${mark}  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

// ── half 1: the signature implementation itself ──────────────────────────────
//
// Before testing the app, test the tester. These vectors are frozen values
// shared with the Digistore SAAS App Template, so an adapter in any language
// that reproduces them is provably computing the same signature.

function selfTest() {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), "vectors.json");
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    record("vectors.json readable", false, String(err.message));
    return false;
  }
  let allOk = true;
  for (const v of data.vectors) {
    const got = digistoreShaSign(v.params, data.passphrase, v.uppercaseKeys);
    const ok = got === v.expected;
    if (!ok) allOk = false;
    record(`vector: ${v.name}`, ok, ok ? null : `expected ${v.expected}\n        got      ${got}`);
  }
  return allOk;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const sign = (params, uppercaseKeys = false) => ({
  ...params,
  sha_sign: digistoreShaSign(params, PASSPHRASE, uppercaseKeys),
});

async function postIpn(params) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    redirect: "manual",
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

/** Ask the app what it thinks. Returns null when no probe was configured. */
async function probeAccess(orderId) {
  if (!PROBE) return null;
  const url = new URL(PROBE);
  url.searchParams.set("order_id", orderId);
  const res = await fetch(url, {
    headers: PROBE_TOKEN ? { authorization: `Bearer ${PROBE_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`probe answered ${res.status}`);
  // Expected shape: { "access": true|false, "suspended": true|false }
  return await res.json();
}

const basePayload = (orderId, event) => ({
  event,
  order_id: orderId,
  product_id: PRODUCT_ID,
  product_name: "Verify Run",
  amount: "47.00",
  currency: "EUR",
  billing_type: "subscription",
  buyer_email: "verify@example.com",
  // A name with an umlaut, on purpose: it is the cheapest way to catch an
  // endpoint that hashes something other than UTF-8.
  buyer_first_name: "Jörg",
  buyer_last_name: "Müller",
  purchase_id: `VERIFY-${orderId}`,
});

// ── half 2: the live endpoint ────────────────────────────────────────────────

async function liveTests() {
  // -- connection check ------------------------------------------------------
  try {
    const res = await fetch(URL_, { method: "GET", redirect: "manual" });
    record(
      "GET answers 200 (Digistore24 endpoint validation)",
      res.status === 200,
      res.status === 200 ? null
        : `got ${res.status}. Digistore24 refuses to register an endpoint that ` +
          `does not answer 200 to a GET — a redirect fails too.`,
    );
  } catch (err) {
    record("GET answers 200 (Digistore24 endpoint validation)", false, String(err.message));
  }

  // -- rejections: the ones that must fail -----------------------------------
  const rejectId = `VR-${randomUUID().slice(0, 8)}`;

  {
    const p = sign(basePayload(rejectId, "on_payment"));
    p.amount = "1.00"; // tampered AFTER signing
    const { status } = await postIpn(p);
    record(
      "tampered payload is rejected",
      status >= 400,
      status >= 400 ? null
        : `endpoint answered ${status}. A changed amount with a stale signature ` +
          `MUST be refused — this is the whole point of the check.`,
    );
  }

  {
    const p = basePayload(rejectId, "on_payment"); // no sha_sign at all
    const { status } = await postIpn(p);
    record(
      "missing signature is rejected",
      status >= 400,
      status >= 400 ? null : `endpoint answered ${status}. Fail closed: no signature means no.`,
    );
  }

  {
    const p = sign(basePayload(rejectId, "on_payment"));
    p.sha_sign = p.sha_sign.slice(0, -1) + (p.sha_sign.endsWith("A") ? "B" : "A");
    const { status } = await postIpn(p);
    record(
      "one flipped byte in the signature is rejected",
      status >= 400,
      status >= 400 ? null : `endpoint answered ${status}.`,
    );
  }

  // -- acceptances -----------------------------------------------------------
  {
    const p = sign(basePayload(`VR-${randomUUID().slice(0, 8)}`, "on_payment"), true);
    const { status } = await postIpn(p);
    record(
      "uppercase-key signature is accepted (convert_keys_to_uppercase)",
      status < 400,
      status < 400 ? null
        : `endpoint answered ${status}. Some Digistore24 accounts sign this way; ` +
          `verify against BOTH conventions.`,
    );
  }

  // -- the access lifecycle --------------------------------------------------
  //
  // Each scenario gets its own order id, so they cannot interfere.

  await scenario("on_payment grants access", async (id) => {
    await postIpn(sign(basePayload(id, "on_payment")));
    return [{ want: { access: true }, why: "a paid order must have access" }];
  });

  await scenario("a repeated event does not credit twice", async (id) => {
    const p = sign(basePayload(id, "on_payment"));
    await postIpn(p);
    await postIpn(p); // Digistore24 really does this
    return [{
      want: { access: true },
      why: "still exactly one grant — check your ledger/credits for a double booking",
      note: "the probe cannot see a doubled token balance; check it by hand if you sell credits",
    }];
  });

  await scenario("on_refund ends access", async (id) => {
    await postIpn(sign(basePayload(id, "on_payment")));
    await postIpn(sign(basePayload(id, "on_refund")));
    return [{ want: { access: false }, why: "a refunded customer must lose access" }];
  });

  await scenario("a redelivered payment does NOT revive a refunded order", async (id) => {
    await postIpn(sign(basePayload(id, "on_payment")));
    await postIpn(sign(basePayload(id, "on_refund")));
    await postIpn(sign(basePayload(id, "on_payment"))); // out-of-order redelivery
    return [{ want: { access: false }, why: "ended is forever — guard on state, not on arrival order" }];
  });

  await scenario("on_payment_missed suspends, on_payment restores", async (id) => {
    await postIpn(sign(basePayload(id, "on_payment")));
    await postIpn(sign(basePayload(id, "on_payment_missed")));
    const mid = await probeAccess(id);
    if (mid && mid.access === true) {
      record("on_payment_missed suspends access", false,
        "access was still granted after a missed payment");
    } else {
      record("on_payment_missed suspends access", mid ? true : null,
        mid ? null : "no --probe: not checked");
    }
    await postIpn(sign(basePayload(id, "on_payment")));
    return [{
      want: { access: true },
      why: "the card was fixed — the suspension must be LIFTED, not left in place " +
           "(an insert-if-absent does not clear it)",
    }];
  });

  await scenario("on_rebill_cancelled leaves access alone", async (id) => {
    await postIpn(sign(basePayload(id, "on_payment")));
    await postIpn(sign(basePayload(id, "on_rebill_cancelled")));
    return [{
      want: { access: true },
      why: "billing stopped; the paid period runs on. Ending access here takes " +
           "away time the customer paid for",
    }];
  });

  await scenario("last_paid_day ends access", async (id) => {
    await postIpn(sign(basePayload(id, "on_payment")));
    await postIpn(sign(basePayload(id, "on_rebill_cancelled")));
    await postIpn(sign(basePayload(id, "last_paid_day")));
    return [{ want: { access: false }, why: "this is how purchased access normally expires" }];
  });
}

async function scenario(name, run) {
  const id = `VR-${randomUUID().slice(0, 8)}`;
  let expectations;
  try {
    expectations = await run(id);
  } catch (err) {
    record(name, false, String(err.message));
    return;
  }
  for (const e of expectations) {
    let actual;
    try {
      actual = await probeAccess(id);
    } catch (err) {
      record(name, false, `probe failed: ${err.message}`);
      continue;
    }
    if (actual === null) {
      record(name, null, "no --probe endpoint: the events were sent, the result was not checked");
      continue;
    }
    const ok = actual.access === e.want.access;
    record(name, ok,
      (ok ? null : `expected access=${e.want.access}, got access=${actual.access} — ${e.why}`) ??
      (e.note ? `note: ${e.note}` : null));
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

if (!AS_JSON) console.log("\nDigistore24 IPN verification\n");

const vectorsOk = selfTest();

if (!vectorsOk) {
  if (!AS_JSON) {
    console.log("\nThe test vectors do not reproduce. This script's own signing is wrong,\n" +
                "so nothing it says about your endpoint would mean anything. Stopping.\n");
  }
  process.exit(1);
}

if (!SELF_TEST_ONLY) {
  if (!PASSPHRASE) {
    record("passphrase given", false,
      "--passphrase or DIGISTORE_IPN_PASSPHRASE is required to sign anything");
  } else {
    if (!AS_JSON) console.log(`\nEndpoint: ${URL_}${PROBE ? `\nProbe:    ${PROBE}` : ""}\n`);
    await liveTests();
  }
}

const failed = results.filter((r) => r.status === "FAIL");
const skipped = results.filter((r) => r.status === "SKIP");

if (AS_JSON) {
  console.log(JSON.stringify({ results, failed: failed.length, skipped: skipped.length }, null, 2));
} else {
  console.log(`\n${results.length - failed.length - skipped.length} passed, ` +
              `${failed.length} failed, ${skipped.length} skipped`);
  if (skipped.length && !PROBE) {
    console.log(
      "\nThe skipped checks are the ACCESS ones — whether a refund really took access\n" +
      "away, whether a cancellation really left it alone. They need --probe: a small,\n" +
      "token-protected endpoint answering {\"access\":true|false} for an order_id.\n" +
      "Without it the signature is proven and the semantics are not.",
    );
  }
}

process.exit(failed.length > 0 ? 1 : 0);
