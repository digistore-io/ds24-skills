// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// Digistore24 IPN endpoint — Express (Node).
//
// TWO FILES, AND THE DIFFERENCE MATTERS:
//   ./signature-node.mjs  — the signature. Copy it verbatim, never edit it.
//   this file             — the endpoint. An EXAMPLE. Adapt it to your app.
//
// The trap specific to Express: `express.urlencoded()` parses the body and
// throws the bytes away, and the signature covers the bytes. So this route
// takes the RAW body and parses it itself — mount `express.raw()` on this path
// only and keep your normal body parser for the rest of the app.
//
// The algorithm and the reasoning are in ../references/ipn-protocol.md; the
// event semantics are in ../references/events.md.

import express from "express";
import { verifyIpnSignature } from "./signature-node.mjs";

const router = express.Router();

/** Digistore24 validates a newly registered endpoint with a GET. */
router.get("/ipn", (_req, res) => res.status(200).send("OK"));

router.post(
  "/ipn",
  // RAW, on this path only. Do NOT put express.urlencoded() in front of it.
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    const passphrase = process.env.DIGISTORE_IPN_PASSPHRASE ?? "";

    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    const params = Object.fromEntries(new URLSearchParams(raw));

    if (!verifyIpnSignature(params, passphrase)) {
      // 403, and nothing about why.
      return res.status(403).send("invalid signature");
    }

    const event = params["event"] || params["order_event"] || "";
    if (event === "connection_test") return res.status(200).send("OK");

    await recordRawIpn(raw, params); // store BEFORE acting on it

    try {
      await handleEvent(event, params);
    } catch (err) {
      // Never throw: Digistore24 retries until it gets a 200, so an exception
      // becomes an endless redelivery loop.
      console.error("[ipn] handler failed", event, params["order_id"], err);
    }

    return res.status(200).send("OK");
  },
);

export default router;

// --- What you implement ------------------------------------------------------
//
// See ../references/events.md. The mapping is identical in every adapter:
//
//   on_payment, on_payment_subscription_signup → grant, and LIFT a suspension
//   on_refund                                  → end, reason "refund"
//   on_chargeback                              → end, reason "chargeback"
//   on_payment_missed                          → suspend (reversible!)
//   on_rebill_resumed                          → lift a suspension, nothing else
//   on_rebill_cancelled                        → NOTHING
//   last_paid_day                              → end, reason "lastPaidDay"
//   anything else                              → accept, change nothing
//
// Two invariants that are not visible in the mapping:
//   - every write is idempotent, keyed on (order_id, event) with a UNIQUE
//     constraint — not a SELECT followed by an INSERT
//   - once access has ended, no later event may reopen it

async function recordRawIpn(raw, params) {
  throw new Error("TODO: store the raw payload verbatim");
}

async function handleEvent(event, params) {
  throw new Error("TODO: implement the mapping above");
}
