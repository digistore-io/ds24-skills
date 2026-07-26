---
name: ds24-checkout
description: Use when building the buy button, pricing page or checkout link for a Digistore24 product — creating a signed buy URL with createBuyUrl, attaching the price as a payment plan, carrying the buyer's identity through to the IPN, and the thank-you page. Use it whenever the user mentions a buy link, checkout, pricing page, "how does the customer pay", or a purchase that arrives without anybody being able to tell whose it was.
---

# The checkout link

A Digistore24 checkout is a **signed, short-lived URL** you create through the
API and send the buyer to. It is not a static link with a product id in it.

## Step 0 — is it already there?

Search the project for `createBuyUrl`, `payment_plan` or a pricing page that
already links out to Digistore24. If it exists, do not rebuild it — check it
against Step 3 and Step 4 and fix only what is wrong.

## Step 0a — is this copy of the skill current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with this pack's `VERSION`. Mention a mismatch in one sentence, then
carry on.

## Step 1 — the call

```
POST https://www.digistore24.com/api/call/createBuyUrl/format/json
Header: X-DS-API-KEY: <the key>
```

Body (form-encoded), the parts that matter:

```
product_id                              = 512345
valid_until                             = 24h
payment_plan[first_amount]              = 47.00
payment_plan[other_amounts]             = 47.00
payment_plan[currency]                  = EUR
payment_plan[number_of_installments]    = 0        # 0 = open-ended subscription, 1 = one-off
payment_plan[first_billing_interval]    = 1_month  # omit entirely for a one-off
payment_plan[other_billing_intervals]   = 1_month
```

**The price is sent here, at purchase time — not stored on the product.**
Digistore24 discards `data[amount]` on the product itself, and a stored payment
plan cannot carry a voucher, a trial, an upgrade or a per-link affiliate
commission. Read the numbers from the one price list in your project (see
**`ds24-products`**).

The response is a URL. **Cache it per offering** — it is valid for the
`valid_until` window, and creating a fresh one on every page view is a
round-trip to Digistore24 in the path of your pricing page.

## Step 2 — carry the buyer's identity through

The single most common failure in a Digistore24 integration is a payment that
arrives and cannot be matched to an account. Somebody paid, the app has no idea
who, and support has to do it by hand.

Send an identifier in the tracking field. It comes back in the IPN as
`custom`:

```
tracking[custom] = m:<member id>:t:<a short random token stored on that member>
```

**Two things about that token.** It corroborates the member id, so a guessed or
edited id alone never claims somebody else's purchase — and it is **not a
credential**: it never authenticates a session, it only says "this id was not
invented by the person typing the URL".

At the other end, in the IPN handler, attribute in this order:

1. the identifier from `custom`, if the token matches → certain.
2. otherwise the buyer's email against your accounts → likely.
3. otherwise **store the order unattributed** and attach it when that address
   first signs in.

Never guess. An unattributed order is a support ticket; a wrongly attributed one
is a customer seeing somebody else's purchase.

## Step 3 — a purchase without an account must still work

Let people buy from the public pricing page without signing in first. That is
how most of them arrive, and forcing an account before payment costs sales.
Path 3 above is what makes it safe: the order waits, and the first sign-in from
that address claims it.

## Step 4 — the thank-you page

Digistore24 sends the buyer to a URL of yours after payment, with the order id
in it. Two rules:

- **It is public.** The buyer has no session yet. Do not put anything behind it
  that assumes one.
- **Do not grant access from it.** It is a browser hitting a URL — anybody can
  hit it. Access comes from the IPN, which is signed. The thank-you page says
  "thank you, it is on its way / here is how to sign in", nothing more.

**Digistore24 stores public https URLs only.** A `localhost` thank-you URL is
rejected outright ("Please only use secure URLs with https://"). On a hosted
platform your app URL is already public, so this is a non-issue; on a laptop it
needs a public redirect helper or a tunnel.

## Step 5 — prove it

1. Create a buy URL and open it. The checkout page must show **your** price,
   currency and interval — if it shows something else, the payment plan did not
   travel.
2. Do a **test purchase** with the Digistore24 test-purchase cookie set.
3. Check that the IPN arrived and that the order came out **attributed to the
   right account**. Attribution is the part that looks fine until it is not.

## Step 6 — what comes next

- **`ds24-ipn`** — the endpoint that receives what this checkout produces.
- **`ds24-entitlements`** — turning a paid order into "may use the product".
- **`ds24-tokens`** — if you sell prepaid credits rather than plans.
- **`ds24-golive`** — the real test purchase, end to end.

Say which one you are starting and start it.
