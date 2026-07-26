// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// The Digistore24 IPN signature — Web Crypto.
//
// COPY THIS FILE VERBATIM. DO NOT EDIT IT.
//
// This is the one for **Deno, Supabase Edge Functions (and therefore Lovable
// Cloud), Cloudflare Workers, and Next.js edge routes** — every runtime where
// `node:crypto` does not exist. Same six steps as ./signature-node.mjs, same
// results, but Web Crypto is asynchronous, so both functions return Promises.
//
// It is deliberately separate from the endpoint adapters: those are examples
// you adapt to your app, this is the part that must not drift. Every line is
// checked against frozen test vectors (../scripts/vectors.json) shared with the
// Digistore SAAS App Template.
//
// Plain JavaScript with JSDoc types on purpose: a TypeScript project imports it
// and still gets full checking, and every runtime can execute it as it stands.
//
// The reasoning behind every step is in ../references/ipn-protocol.md.

/** @typedef {Record<string, string>} IpnParams */

/**
 * Computes the Digistore24 SHA signature over a set of IPN parameters.
 *
 * @param {IpnParams} params
 * @param {string} passphrase
 * @param {boolean} [uppercaseKeys] sign with uppercased field names
 *                                  (`convert_keys_to_uppercase`). Digistore24's
 *                                  own default is FALSE — the original case.
 * @returns {Promise<string>} uppercase hex
 */
export async function digistoreShaSign(params, passphrase, uppercaseKeys = false) {
  const prepared = Object.entries(params)
    // 1. sha_sign / SHASIGN carry the signature and were not part of it.
    .filter(([key]) => {
      const up = key.toUpperCase();
      return up !== "SHA_SIGN" && up !== "SHASIGN";
    })
    .map(([key, value]) => ({ key: uppercaseKeys ? key.toUpperCase() : key, value }))
    // 2. Byte order — PHP's ksort($p, SORT_STRING). NOT localeCompare().
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  let shaString = "";
  for (const { key, value } of prepared) {
    // 3. An empty value contributes nothing — not even its key.
    if (value === undefined || value === null || value === "") continue;
    // 4. The passphrase ends EVERY pair, not just the last one.
    shaString += `${key}=${value}${passphrase}`;
  }

  // 5. SHA512 over the UTF-8 bytes, uppercase hex. TextEncoder is always UTF-8,
  //    which is what makes an umlaut in a buyer name hash here the way it
  //    hashed on Digistore24's side.
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(shaString));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Constant-time comparison of two hex strings. Web Crypto has no
 * timingSafeEqual, so this is it — no early return on the first differing
 * character.
 *
 * @param {string} a
 * @param {string} b
 */
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies an IPN payload. Fails closed: a missing signature or a missing
 * passphrase is a rejection, never a bypass.
 *
 * Tries BOTH key-case conventions — see ./signature-node.mjs for why.
 *
 * @param {IpnParams} params
 * @param {string} passphrase
 * @returns {Promise<boolean>}
 */
export async function verifyIpnSignature(params, passphrase) {
  const received = params["sha_sign"] ?? params["SHASIGN"];
  if (!received || !passphrase) return false;

  const target = received.toUpperCase();

  for (const uppercaseKeys of [false, true]) {
    // 6. Constant time.
    if (timingSafeEqualHex(target, await digistoreShaSign(params, passphrase, uppercaseKeys))) {
      return true;
    }
  }
  return false;
}
