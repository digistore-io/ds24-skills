// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// The Digistore24 IPN signature — Node runtime (node:crypto).
//
// COPY THIS FILE VERBATIM. DO NOT EDIT IT.
//
// It is deliberately separate from the endpoint adapters: those are examples
// you adapt to your app, this is the part that must not drift. Every line of it
// is checked against frozen test vectors (../scripts/vectors.json) that are
// shared with the Digistore SAAS App Template — so an implementation that
// reproduces them is provably computing what Digistore24 computes.
//
// Plain JavaScript with JSDoc types on purpose: a TypeScript project imports it
// and still gets full checking, and every runtime can execute it as it stands.
//
// For Deno, Supabase Edge Functions, Cloudflare Workers or a Next.js edge
// route, use ./signature-web.mjs instead — same six steps, Web Crypto, async.
//
// The reasoning behind every step is in ../references/ipn-protocol.md.

import { createHash, timingSafeEqual } from "node:crypto";

/** @typedef {Record<string, string>} IpnParams */

/**
 * Computes the Digistore24 SHA signature over a set of IPN parameters.
 *
 * @param {IpnParams} params        the POSTed parameters
 * @param {string} passphrase       your IPN passphrase
 * @param {boolean} [uppercaseKeys] sign with uppercased field names
 *                                  (`convert_keys_to_uppercase`). Digistore24's
 *                                  own default is FALSE — the original case.
 * @returns {string} uppercase hex
 */
export function digistoreShaSign(params, passphrase, uppercaseKeys = false) {
  const prepared = Object.entries(params)
    // 1. sha_sign / SHASIGN carry the signature and were not part of it.
    .filter(([key]) => {
      const up = key.toUpperCase();
      return up !== "SHA_SIGN" && up !== "SHASIGN";
    })
    .map(([key, value]) => ({ key: uppercaseKeys ? key.toUpperCase() : key, value }))
    // 2. Byte order — PHP's ksort($p, SORT_STRING). NOT localeCompare(), which
    //    is locale-aware and orders "_" and letters differently.
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  let shaString = "";
  for (const { key, value } of prepared) {
    // 3. An empty value contributes nothing — not even its key.
    if (value === undefined || value === null || value === "") continue;
    // 4. The passphrase ends EVERY pair, not just the last one.
    shaString += `${key}=${value}${passphrase}`;
  }

  // 5. SHA512 over the UTF-8 bytes, uppercase hex.
  return createHash("sha512").update(shaString, "utf8").digest("hex").toUpperCase();
}

/**
 * Verifies an IPN payload. Fails closed: a missing signature or a missing
 * passphrase is a rejection, never a bypass.
 *
 * Tries BOTH key-case conventions. Digistore24 signs with the original case,
 * but an account configured the other way is legitimate — and both variants
 * require the secret passphrase, so accepting either costs no security.
 *
 * @param {IpnParams} params
 * @param {string} passphrase
 * @returns {boolean}
 */
export function verifyIpnSignature(params, passphrase) {
  const received = params["sha_sign"] ?? params["SHASIGN"];
  if (!received || !passphrase) return false;

  const a = Buffer.from(received.toUpperCase(), "utf8");

  for (const uppercaseKeys of [false, true]) {
    const b = Buffer.from(digistoreShaSign(params, passphrase, uppercaseKeys), "utf8");
    // 6. Constant time. Length is checked first because timingSafeEqual throws
    //    on differing lengths rather than returning false.
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
