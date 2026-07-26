<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The Digistore24 IPN signature

Digistore24 tells your app that money moved by POSTing a form-encoded payload to
an endpoint you registered. That endpoint is on the public internet, so anybody
can POST to it. **The signature is the only thing that separates a real payment
from somebody typing a URL into `curl`.** Everything else in this document
follows from that one sentence.

Reference implementation Digistore24 publishes:
<https://www.digistore24.com/download/ipn/examples/ipn/sha_sign.php>

## The algorithm — six steps

Given the POSTed parameters and your **IPN passphrase**:

1. **Drop `sha_sign` and `SHASIGN`** from the parameter set (compare the names
   case-insensitively). They carry the signature itself and were not part of
   what was signed.
2. **Sort the remaining keys as byte strings.** This is PHP's
   `ksort($params, SORT_STRING)` — a plain byte-order comparison, *not* a
   locale-aware or case-insensitive one. In JavaScript that is
   `a < b ? -1 : a > b ? 1 : 0`, not `a.localeCompare(b)`.
3. **Skip empty values.** `undefined`, `null` and `""` contribute nothing — not
   even their key. A field that arrived empty must be treated as if it had not
   arrived at all.
4. **Concatenate**, for every remaining parameter in sorted order:
   `KEY` + `=` + `VALUE` + `PASSPHRASE`. The passphrase goes after *every*
   pair, not once at the end.
5. **Hash the result with SHA512**, UTF-8 encoded, and render it as **uppercase
   hex**.
6. **Compare** against the received `sha_sign` **case-insensitively** and in
   **constant time**.

Worked example — parameters `{order_id: "ORD-1", product_id: "42"}` with the
passphrase `s3cret-passphrase`. Sorted, that is `order_id` before `product_id`,
so the string being hashed is:

```
order_id=ORD-1s3cret-passphraseproduct_id=42s3cret-passphrase
```

There are no separators between the pairs. The passphrase is what ends each one.

## The trap that costs everybody a day

**Digistore24 signs with the ORIGINAL field names — `order_id=…`, not
`ORDER_ID=…`.**

The official PHP example carries a `convert_keys_to_uppercase` switch, and
reading it top to bottom suggests uppercasing is the norm. Observed against live
Digistore24 accounts it is not: the field names are signed exactly as they were
sent. An implementation that uppercases unconditionally computes a perfectly
valid signature over the wrong input and rejects **every real IPN** with
"signature invalid" — while all your own tests pass, because they sign the same
wrong way they verify.

**So verify against both conventions.** Compute the signature with the original
case, and if that does not match, compute it again with uppercased keys.
Accepting either costs nothing in security — both variants require the secret
passphrase — and it spares the operator from having to match a setting in their
Digistore24 account that they cannot see.

## Fail closed, always

These are not edge cases. They are the shape of an attack:

| Situation | Correct answer |
|---|---|
| No `sha_sign` in the payload | **reject** |
| No passphrase configured on your side | **reject** |
| Signature present but does not match | **reject** |
| An unknown event with a valid signature | accept the request, change nothing |

The second row is the one that gets built wrong. "If no passphrase is
configured, skip the check" is a reasonable-sounding line of code that turns
your payment webhook into a public write endpoint the moment an environment
variable goes missing on a redeploy. **A missing passphrase is a rejection, not
a bypass.**

## Reading the body

The signature covers the bytes that were sent. Anything that rewrites them
breaks it:

- **Read the raw body**, then parse it yourself. A framework that parses,
  re-serialises and hands you an object may have reordered or re-encoded
  something.
- **Digistore24 posts `application/x-www-form-urlencoded`**, not JSON.
- **Do not trim, lowercase or normalise values** before signing. Percent-decode
  exactly once, the way form parsing does, and leave it there.
- **UTF-8.** Buyer names carry umlauts, accents and non-Latin scripts. Hash the
  UTF-8 bytes; a language that defaults to Latin-1 (older Python setups,
  some PHP configurations) will silently produce a different hash for
  `Jörg Müller` than for the same name Digistore24 signed.

## Answering

- **Answer `200` with a short body** once you have processed the event.
  Digistore24 **retries until it gets a 200**, so an unhandled exception turns
  into an endless redelivery loop.
- **Answer the connection test.** Digistore24 validates the endpoint when you
  register it, and it does so with a `GET`. Return `200 OK` for a GET, and for a
  POST whose event is `connection_test`.
- **Never redirect.** A `301`/`302` from your IPN endpoint fails validation —
  Digistore24 wants the endpoint itself, not a hop.
- **The URL must be public `https`.** Digistore24 refuses `http` and refuses
  `localhost` outright. On a hosted AI-builder platform your preview URL is
  already public https, which is the one thing that is *easier* there than on a
  laptop.

## Delivery is unordered and unbounded

Two properties of the transport that your handler has to survive, because
neither of them shows up in testing:

- **Events arrive out of order.** A redelivered `on_payment` can land *after*
  the `on_refund` that ended access. So the decision "may this person use the
  product" must be made from **state**, not from a timestamp and not from the
  arrival order. Once access has been ended, no later event may reopen it.
- **The same event arrives more than once.** Digistore24 retries until it gets a
  200, and a timeout on your side after the work was done still counts as a
  failure. **Every write your handler makes has to be idempotent**, keyed on
  something from the payload — `order_id` plus event, or `purchase_id`. Crediting
  a token balance without such a key hands out the credits twice.

## What to store

Store the **raw payload** of every IPN you accept, verbatim, before you act on
it. It costs almost nothing and it is the only way to answer "did Digistore24
really send that?" weeks later, when a customer disputes access and your derived
tables all agree with each other.

Store the **event name** as it arrived. Do not collapse events into a status and
then make decisions from the status — see `events.md`, where two events that
mean opposite things about access map to the same word.
