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

Re-point it by calling `ipnSetup` again with the **same `domain_id`** and the
live URL — that updates the connection. A new `domain_id` creates a second one
and leaves the dead first in place (**`ds24-products`**, Step 4). While you are
there, check the connection's `product_ids` covers the products you are actually
about to sell.

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
   it expires.) On the live domain the cookie is the right tool — the testpay
   parameter from development (**`ds24-checkout`**, Step 4a) belongs on URLs
   customers can never reach, so do not carry it over here.
2. Buy the product through the app's own buy link — not a link you constructed
   by hand for the test.
3. Watch for: the checkout shows **your** price and interval; the thank-you page
   loads; the IPN arrives; the order is stored; **access appears in the app**.
   If the IPN does not arrive, `getPurchase` (**`ds24-products`**, Step 7) says
   whether Digistore24 recorded the purchase at all — that is the difference
   between a failed checkout and a broken connection, and you cannot tell them
   apart from the app alone.
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

**Which marketplace you submit to follows the PRODUCT's language**, not the
app's: a German product goes to Digistore24 GmbH, Germany (`siteowner_id` 1),
anything else to Digistore24 Inc., USA (2). An app selling in two languages
therefore submits its two products to two different marketplaces — deriving one
marketplace from an app-wide setting is the mistake to avoid here, because it
silently submits your English offering to the German reseller.

**Whether it was granted is readable, not guessable.** Every `listProducts` /
`getProduct` item carries `approval_status_list` — one entry per marketplace
(`reseller_id`) with `approval_status` one of `new` (never requested),
`pending`, `approved` or `rejected`, plus `is_siteowner_active` and the
rejection-reason fields. The field is not in the official API docs (verified
empirically 2026-07), so read it defensively: a missing list or an unknown value
means "cannot tell", not a state.

**There are two different questions, and they need different reads:**

| Question | How to read the list |
|---|---|
| *Can this product be sold at all?* — for a status display or a reminder | Aggregate across every marketplace the account is **active** for: **approved anywhere wins**, else pending, else rejected, else new. A product approved in Germany sells in Germany whatever the US reseller decided |
| *Should I request approval here?* — before a write | The entry for **that one** `reseller_id`. A product approved in Germany may still have a legitimate request to make in the USA |

Ignore an entry whose `is_siteowner_active` is `"N"`: that marketplace cannot
act, so its verdict says nothing — and treating it as a real state produces a
warning about a marketplace nobody can use.

Four rules for the write itself:

- **`pending` is the only status worth writing.** `updateProduct` will accept
  the others, and that is the trap: writing `approved` onto your own product
  makes every status display believe it sells, so whatever reminder you built
  goes quiet for a product no reseller ever looked at. `new` withdraws a request
  that was already queued. `approved` and `rejected` belong to the reseller.
- **Do not re-request a product that is already `approved` at the marketplace
  you are writing to.** The reseller side decides on `pending` products only,
  and whether writing `pending` over an approval resets it is undocumented —
  not an experiment for a live account.
- **Do not write when you could not read.** If the status call failed, or the
  product is missing from the response, you cannot rule out an existing
  approval — so refuse and say why, rather than requesting blind. Fail-open
  here is how an approved, selling product gets set back to pending. One state
  that looks the same and is not: a marketplace that is simply **absent** from a
  list you read successfully — a private siteowner Digistore24 does not report
  on. There is nothing there to overwrite, so that request goes out normally.
- **Do not write to a marketplace whose `is_siteowner_active` is `"N"`.** The
  call succeeds, nobody there will ever look at it, and a status display that
  filters inactive marketplaces out will go on reporting the product as never
  submitted — for ever, with repeating the request changing nothing.

A `rejected` product names its reason in the Digistore24 vendor account. Fix it
there **first**: resubmitting it unchanged gets it rejected again, and the
second attempt is slower than the first.

## Step 5 — the day it is live

**First, rotate the test-purchase key** if the integration ever used the
testpay parameter during development (**`ds24-checkout`**, Step 4a): call
`getTestpayKey` with `do_recreate=1`. The key is account-level — a copy handed
around while building would unlock test "purchases" on the live checkout for
whoever still holds it. Rotating invalidates every old copy in one call.

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
