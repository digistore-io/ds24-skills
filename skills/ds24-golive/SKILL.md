---
name: ds24-golive
description: Use when a Digistore24 integration is built and has to be proven before real customers reach it — the pre-flight check, the test purchase with the Digistore24 test cookie, marketplace approval, and the go-live checks on the live domain. Use it whenever the user says they want to go live, launch, sell for real, do a test purchase, or asks whether the payment integration is actually ready.
---

# Going live

The integration is built. Now prove it moves money and unlocks the product —
before somebody who is not you finds out that it does not.

**Do not skip to approval.** A product approved and public with a broken IPN
sells access nobody receives, and every one of those is a refund plus a support
conversation.

## Step 0a — is this copy of the skill pack current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with this pack's `VERSION`. Mention a mismatch in one sentence, then
carry on.

## Step 1 — pre-flight

Go through these and **report each one with what you actually saw**, not with a
tick:

| Check | Passes when |
|---|---|
| The app is reachable at its **public https** domain | a request from outside answers |
| `GET <domain>/api/ipn` (or your path) | answers **200**, no redirect |
| `DIGISTORE_IPN_PASSPHRASE` is set **in the deployed environment** | not just in a local file |
| `DIGISTORE_API_KEY` is set in the deployed environment | — |
| The IPN connection at Digistore24 points at the **live** domain | not at a tunnel or a preview URL from development |
| The product exists and its price matches your price list | — |
| Secrets are in the platform's secret store | not in the repository |

The fifth row is the one that bites after a redeploy: a preview URL from
building the thing is still registered, and every real purchase goes to an
address that no longer answers.

## Step 2 — the signature, one more time, against live

Whatever proved the endpoint during development, run it again **against the live
domain**. The **`ds24-ipn`** skill holds the how — its verification reference
gives two shapes, and step 2 needs the one that goes over HTTP from outside: a
test inside the app exercises the handler, not the deployment, and the failures
that appear only now are deployment failures. A proxy that rewrites the body, a
passphrase that never made it into the deployed environment.

If `ds24-ipn` is not installed, install it — this step cannot be done properly
without what it says.

Green, with **no skips**, or it is not ready. A run with skipped access checks
means the signature is proven and the semantics are not — say that plainly
rather than calling it green.

Delete the probe endpoint once this passes.

## Step 3 — the test purchase

This is the step that cannot be replaced by anything else, because it is the
only one that exercises Digistore24's side too.

1. The vendor sets the **Digistore24 test-purchase cookie** in their browser.
   (Digistore24's help centre has the link that sets it; it is per-browser and
   it expires.)
2. Buy the product through the app's own buy link — not a link you constructed
   by hand for the test.
3. Watch for: the checkout shows **your** price and interval; the thank-you page
   loads; the IPN arrives; the order is stored; **access appears in the app**.
4. Sign in as that customer and confirm the paid thing is actually usable.

Then the other half, which people skip and should not:

5. **Refund the test purchase** from the Digistore24 account.
6. Confirm access is **gone** in the app.

A purchase that grants access proves half the integration. The refund proves the
half that protects you.

## Step 4 — approval

Only now. Request marketplace approval (`approval_status=pending`) once the
product description and the app are genuinely finished — a half-built product
gets rejected, and the second attempt is slower than the first.

Until approval, test purchases by the vendor are the only purchases possible.
That is the correct state to be in while building.

## Step 5 — the day it is live

Say these three things to the user in plain words, because none of them is
obvious:

- **Watch the first real purchase.** Not the dashboard — the app. Whether access
  appeared is the only question that matters.
- **Keep the raw IPN payloads.** They are how any dispute in the next months
  gets answered.
- **A payment that arrives unattributed is normal, not a bug.** Somebody bought
  without an account, or with a different address. Have a way to attach it by
  hand (see **`ds24-entitlements`**, manual grants) before you need it at speed.

## Step 6 — what comes next

- **`ds24-compliance`** — the legal pages and obligations that a live,
  paid-for app in the EU triggers. Do this before real customers, not after.

Say whether to start it.
