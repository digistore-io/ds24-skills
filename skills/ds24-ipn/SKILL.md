---
name: ds24-ipn
description: Use when building or fixing the Digistore24 IPN webhook — the endpoint that receives payment events and turns them into access. Covers the SHA512 signature check, the event-to-access mapping, idempotency, and a verification script that proves the endpoint is correct. Use it whenever the user mentions Digistore24 IPN, a payment webhook, "signature invalid", purchases that do not unlock anything, refunds that do not revoke access, or a cancelled subscription that lost access too early.
---

# The Digistore24 IPN endpoint

This is the piece that decides who paid and what they may use. Everything else
in a Digistore24 integration can be redone later; this one has to be right the
first time, because getting it wrong either lets strangers unlock your product
or takes access away from people who paid.

You are building it into whatever stack the user already has. This skill does
not assume Next.js, Supabase, Python or anything else — it gives you the
protocol, an adapter for your runtime, and a script that proves the result.

## Step 0 — is it already there?

Look before you ask. Search the project for `sha_sign`, `on_payment`,
`DIGISTORE_IPN_PASSPHRASE` or a route containing `ipn`.

- **Nothing found** → continue with Step 1.
- **Something found** → do not rebuild it. Go to Step 5 and run the verifier
  against it. Fix what it reports, and nothing else.

## Step 0a — is this copy of the skill current?

Skills you imported into a workspace do not update themselves. Fetch
`https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION` and
compare it with the `VERSION` file next to this pack. If yours is older, say so
in one sentence and offer to re-import — then carry on either way. A stale copy
is usually still correct; an unmentioned stale copy is how a fixed bug comes
back.

## Step 1 — read the protocol

Read **`references/ipn-protocol.md`** now, in full. It is two pages and it
contains the one detail that costs everybody a day: Digistore24 signs with the
**original** field-name case (`order_id=…`), not uppercased, even though its own
PHP example suggests otherwise. An implementation that gets this wrong passes
all of its own tests and rejects every real payment.

Then read **`references/events.md`**. It has the table that maps events to
access, including the two rows that are counter-intuitive and that cost money
when guessed:

- `on_rebill_cancelled` does **nothing** to access.
- `on_payment_missed` **suspends reversibly** — it is an expired card, not a
  departure.

Do not skim these and write from memory. Every sentence in them is there because
somebody got it wrong in production.

## Step 2 — copy the signature module, do not write one

`adapters/` holds three signature implementations. **Copy the one that matches
the runtime, verbatim, and never edit it:**

| Runtime | File |
|---|---|
| Node (Next.js Node runtime, Express, Nest, plain Node) | `adapters/signature-node.mjs` |
| **Deno / Supabase Edge Functions / Lovable Cloud** / Cloudflare Workers / Next.js edge | `adapters/signature-web.mjs` |
| Python (FastAPI, Django, Flask, bare) | `adapters/signature.py` |

All three are checked against frozen test vectors shared with the Digistore SAAS
App Template, so they provably agree with each other and with a live
Digistore24 account. Rewriting one "to fit the code style" throws that guarantee
away for nothing.

They are plain JavaScript with JSDoc types (or plain Python), so a TypeScript
project imports them and still gets full type checking.

## Step 3 — build the endpoint from the matching adapter

The endpoint files next to them are **examples you adapt**, not files to copy
blindly:

| Stack | File |
|---|---|
| Next.js App Router | `adapters/next-node.ts` |
| **Supabase Edge Function / Lovable Cloud** | `adapters/deno-edge.ts` |
| Express | `adapters/express-node.js` |
| FastAPI | `adapters/python-fastapi.py` |

Whatever the stack, these five properties are not negotiable:

1. **Read the raw body and parse it yourself.** Digistore24 posts
   `application/x-www-form-urlencoded`. A framework that parses and
   re-serialises can break the signature.
2. **Fail closed.** No signature → reject. No passphrase configured → reject.
   "Skip the check when the passphrase is missing" turns the endpoint into a
   public write endpoint the first time an env var goes missing on a redeploy.
3. **Answer `200` to a GET**, and to `connection_test`. Digistore24 validates
   the endpoint that way and refuses to register one that redirects.
4. **Never throw out of the handler.** Digistore24 retries until it gets a 200,
   so an exception becomes an endless redelivery loop. Log it, answer 200,
   replay from the stored raw payload.
5. **Store the raw payload before acting on it.** It is the only record that
   survives a bug in everything downstream.

**On Lovable Cloud / Supabase there is a sixth**, and skipping it is silent:
the function must be deployed with **`verify_jwt = false`**. Digistore24 sends
no Supabase JWT, so with the default on, every IPN gets a 401 before your code
runs and every purchase fails to unlock anything — with no error visible
anywhere in the app. Put it in `supabase/config.toml`:

```toml
[functions.ds24-ipn]
verify_jwt = false
```

## Step 4 — the two invariants that are not in the switch

Write these down in the app's own notes, because they are invisible in review:

- **Every write is idempotent**, keyed on `(order_id, event)` — with a UNIQUE
  constraint, not a `SELECT` followed by an `INSERT`, which two concurrent
  redeliveries walk straight through. Digistore24 retries after a timeout even
  when the work succeeded.
- **Ended is forever.** Once access ended (refund, chargeback, last paid day),
  no later event may reopen it. Delivery is unordered, so a redelivered
  `on_payment` can arrive *after* the refund. Guard on the stored state, before
  looking at the event name.

## Step 5 — prove it

Do not tell the user it works. Run the verifier:

```bash
node scripts/verify-ipn.mjs \
  --url https://<the app>/api/ipn \
  --passphrase "$DIGISTORE_IPN_PASSPHRASE"
```

It checks its own signing against the vectors first, then sends real signed
payloads: a tampered one that must be rejected, a missing signature that must be
rejected, an uppercase-key signature that must be accepted, and the full access
lifecycle.

**The access half needs a probe.** The script cannot see your database, so to
check whether a refund really took access away it needs a small endpoint that
answers `{"access": true|false}` for an `order_id`:

```bash
node scripts/verify-ipn.mjs --url … --passphrase … \
  --probe https://<the app>/api/ds24-selftest --probe-token "$SECRET"
```

Build that endpoint, guard it with a bearer token, run the verifier, then
**delete it**. It is a test fixture, not a feature. Without it the script says
`SKIP` on those checks and prints why — do not report a run with skips as a
clean bill of health.

To check the shipped signature modules on their own (no app needed):

```bash
node scripts/check-adapters.mjs      # all three runtimes against the vectors
```

## Step 6 — what comes next

The endpoint receives events. Three things still have to exist around it:

- **`ds24-products`** — get the API key, create the products at Digistore24 and
  register this endpoint as the IPN connection. Without it nothing ever calls
  you. **Start here.**
- **`ds24-entitlements`** — the access record the events write to, and the one
  function the rest of the app asks.
- **`ds24-checkout`** — the buy link that starts a purchase.

Say which one you are starting and start it.
