<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Proving the IPN endpoint is correct

An IPN handler that has only been reasoned about has not been tested. This
document says **what has to be proven** and **what must not be improvised** —
not which tool to use. Build the check in whatever runs on your platform.

## The one thing you may not generate yourself

`../scripts/vectors.json` holds eight frozen input/output pairs for the
signature: parameters, passphrase, and the exact uppercase-hex SHA512 that
Digistore24 produces for them.

**Your implementation must reproduce all eight, byte for byte.**

This is the load-bearing rule of the whole document, and the reason is not
pedantry:

> If you compute the expected signatures with your own code, you have proven
> that your code agrees with itself. The failure this guards against —
> signing with uppercased field names — produces a perfectly self-consistent
> implementation whose own tests all pass and which rejects **every real
> payment**. A test written by the same author, from the same misunderstanding,
> agrees with the bug.

So: the vectors come from outside. Do not recompute them, do not "fix" one that
fails, do not regenerate the file. A failing vector means your signing is wrong.

They are the same vectors the [Digistore SAAS App
Template](https://github.com/digistore-io/ds24-appkit) measures its own
implementation against, so reproducing them means agreeing with code that is in
production.

Check them **first**. A checker whose signing is wrong says nothing about an
endpoint.

## Two shapes, pick the one your platform can run

### A — from outside, over HTTP

A separate program signs payloads and posts them at the deployed endpoint. It
needs a runtime with network access and nothing else, and it tests the endpoint
exactly as Digistore24 reaches it — through the real proxy, the real routing,
the real framework.

**Ready-made:** `../scripts/verify-ipn.mjs` does all of this. It needs Node and
a network connection, nothing more, and it runs against any stack. Use it
wherever you have a shell — Replit, v0, Manus, Claude Code, Codex, or your own
machine.

**The catch:** from outside, the checker cannot see the database. Whether a
refund really removed access is invisible to it. That is what the probe below is
for.

### B — from inside the app

A test in the app's own stack — a Deno test on Supabase and Lovable Cloud, a
vitest/jest test in a Node app, pytest in Python. It builds the signed payload,
calls the handler (or posts to the local URL), and then **looks straight at the
database**.

**Use this where there is no shell** — Lovable is the case that matters: skills
travel with their bundled files there, but the platform reads them as reference
material rather than executing them. Anything the agent builds *inside the app*
runs fine.

**The advantage nobody expects:** no probe endpoint. The test already has
database access, so it reads the access record directly. Shape A needs a
temporary endpoint that shape B does not.

**The catch:** it exercises the handler, not the deployment. A signature that
works in a test and fails live — because a proxy rewrites the body, or the
passphrase is missing in the deployed environment — is exactly what shape A
would have caught. When the app is live, run shape A once as well, even if it
means running it from your own machine.

## What has to be proven

Both shapes check the same things. Anything not on this list is a bonus;
anything missing from it is a hole.

**The signature**

| Case | Must |
|---|---|
| all eight vectors in `vectors.json` | reproduce exactly |
| correctly signed payload | be accepted |
| one flipped byte in the signature | be rejected |
| a value changed after signing | be rejected |
| no `sha_sign` in the payload | be rejected |
| no passphrase configured | be rejected — **never a bypass** |
| signature over uppercased field names | be accepted |
| `GET` on the endpoint | answer `200` — Digistore24 validates it this way |

**The access lifecycle** — one fresh order id per case, so they cannot interfere

| Case | Must |
|---|---|
| `on_payment` | grant access |
| the same event delivered twice | not grant twice, not credit twice |
| `on_refund` | remove access |
| `on_payment` redelivered *after* `on_refund` | **not** revive access |
| `on_payment_missed` | suspend — access gone, record not ended |
| `on_payment` after `on_payment_missed` | restore — the suspension is **lifted** |
| `on_rebill_cancelled` | leave access **unchanged** |
| `last_paid_day` | end access |

The last two are the pair that costs money when guessed. See `events.md`.

## The probe — shape A only

To check the access half from outside, the app has to answer one question. Build
a small endpoint that takes an `order_id` and returns

```json
{ "access": true, "suspended": false }
```

Three rules:

- **Guard it with a bearer token.** It reports on other people's purchases.
- **Delete it when the run is green.** It is a test fixture, not a feature. An
  endpoint that survives the test is an endpoint nobody remembers to secure.
- **It reads, never writes.**

Shape B needs none of this.

## Reporting

**Say what was not checked.** A run that skipped the access half because no
probe existed is not a green run — it is a proven signature and unproven
semantics. `verify-ipn.mjs` prints `SKIP` for exactly this reason and never
counts it as a pass; whatever you build should do the same.

And report what the run actually said, not that you ran it.
