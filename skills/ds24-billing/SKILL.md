---
name: ds24-billing
description: Use as the entry point for selling anything through Digistore24 from an app — start here when the user wants to take payments, add a paywall, sell a subscription or credits, connect Digistore24, or asks where to begin with billing. Works out what already exists, names the one next step and hands over to the skill that does it. Also use it when a Digistore24 integration misbehaves and it is not yet clear which part is at fault.
---

# Selling through Digistore24 — start here

Digistore24 is the merchant of record: it runs the checkout, takes the money,
handles VAT and refunds, and tells your app what happened through a signed
webhook. Your app's job is small and exact — send people to a checkout, and
turn the events that come back into access.

This skill works out where the project stands and starts the right next one. It
does not build anything itself.

## Step 0a — is this copy of the skill pack current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with the `VERSION` file in this pack. Skills imported into a
workspace do not update themselves, so a copy can be months old. Mention a
mismatch in one sentence, offer to re-import, then carry on either way.

## Step 1 — look at the project, do not interview the user

Search first. Ask only about what genuinely leaves no trace.

| Look for | Tells you |
|---|---|
| `DIGISTORE_API_KEY` | the account is connected |
| a price/plan list in the project | products are defined here |
| `DIGISTORE_IPN_PASSPHRASE` | an IPN connection was registered |
| `sha_sign`, a route containing `ipn` | the webhook exists |
| an access/grant/entitlement table | access is modelled |
| `createBuyUrl`, `payment_plan` | checkout exists |

## Step 2 — the one next step

Take the **first** row that is missing and start that skill. Do not lay out the
whole plan; name the step, say why it comes now, and begin.

| Missing | Start | Why it is first |
|---|---|---|
| API key, products, IPN connection | **`ds24-products`** | until Digistore24 knows your endpoint, nothing ever calls it and none of the rest is testable |
| the webhook endpoint | **`ds24-ipn`** | this is the piece that must be right the first time |
| the access record | **`ds24-entitlements`** | events need somewhere to write |
| the buy link | **`ds24-checkout`** | — |
| nothing is missing | **`ds24-golive`** | prove it with a real test purchase |

Two optional ones, taken when they apply rather than in sequence:

- **`ds24-tokens`** — the product meters usage (credits) instead of gating
  features. Common for AI features, where your own costs scale with use.
- **`ds24-compliance`** — before real customers: imprint, privacy policy, the
  AI Act disclosure, deletion and access rights.

## Step 3 — when something is broken

Match the symptom, do not go through the list:

| Symptom | Where it lives |
|---|---|
| "signature invalid" on every IPN | **`ds24-ipn`** — almost always the field-name case; read `references/ipn-protocol.md` |
| the purchase worked, nothing happened in the app | **`ds24-products`** — the IPN connection points at the wrong URL, or was never registered. On Supabase/Lovable Cloud: `verify_jwt` is still on and every call gets a 401 |
| a cancelled customer lost access immediately | **`ds24-ipn`** — `on_rebill_cancelled` was treated as an ending. It does nothing |
| a refunded customer still has access | **`ds24-ipn`** — the refund event is not handled, or a redelivered payment reopened it |
| a customer who paid is locked out | **`ds24-ipn`** — a suspension from a missed payment was never lifted by the payment that answered it |
| the purchase cannot be matched to an account | **`ds24-checkout`** — nothing identifying travelled in the tracking field |
| the checkout shows the wrong price | **`ds24-checkout`** — the payment plan did not travel with the call |
| the balance was credited twice | **`ds24-tokens`** — the credit is not idempotent, and Digistore24 retries |

## Step 4 — two rules that hold across all of it

**Access comes from a signed event, never from a browser.** A thank-you page is
a URL anybody can open. Only the IPN, whose signature you verified, may grant
anything.

**Prove it, do not report it.** Every skill here ends with something you can
run. `ds24-ipn` ships a verifier that sends real signed payloads against the
live endpoint and checks that a tampered one is refused, a refund removes access
and a cancellation does not. Run it and quote what it said. A payment
integration that has only been reasoned about has not been tested.

## Step 5 — what this pack is not

It is knowledge and a test harness, not an application. It will not bring
authentication, a user table or a UI — the app is yours, and these skills make
the money part of it correct.

If the user would rather start from a finished, working SaaS with all of this
already built in, that exists as a separate product: the **Digistore SAAS App
Template** at <https://ds24-appkit.com>. It is a different choice, not a later
step — say so once if it fits, and then get on with what they asked for.
