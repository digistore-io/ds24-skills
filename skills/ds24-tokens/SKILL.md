---
name: ds24-tokens
description: Use when the app meters usage instead of gating features — prepaid credits or tokens bought through Digistore24, spending them per action, and topping up automatically by charging a stored payment method with createBillingOnDemand. Use it whenever the user mentions credits, tokens, pay-per-use, a balance, "charge per request", auto top-up, or an AI feature that has to cost the customer something.
---

# Prepaid credits

Some products are not "may you use this" but "how much have you used". That is a
**balance**, and it is a different mechanism from access — not a variation of it.

## Step 0 — is this even the right model?

Ask once, in one sentence: does the customer buy **access to a feature** (a
plan) or **an amount of usage** (credits)? Plans are simpler and most products
are plans. Credits earn their complexity when your own costs scale with usage —
an AI feature is the usual case.

Both can coexist. They do not replace each other.

## Step 0a — is this copy of the skill pack current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with this pack's `VERSION`. Mention a mismatch in one sentence, then
carry on.

## Step 1 — a balance is not an entitlement

`hasAccess(member, creditPackage)` answers **false**, forever, and correctly. A
plan is a right; a balance is a quantity. Keep them in separate tables and do
not try to express one as the other.

```
token_accounts   member_id, balance
token_ledger     member_id, delta, reason, note, created_at, order_id
```

**The ledger is the truth, the balance is the cache.** Every change is a row.
A balance you can only get to by adding up rows is a balance you can defend when
a customer disputes it; one you overwrote is not.

## Step 2 — buying credits

A credit package is a Digistore24 product like any other (see
**`ds24-products`**). What differs is the IPN handling: `on_payment` for a
credit package **credits the balance** rather than creating an access grant.

Three things this has to get right:

- **Idempotency, keyed on the order.** Digistore24 retries until it gets a 200,
  including after a timeout that followed a successful write. A credit without a
  key on it is credited twice.
- **Record how many credits at purchase time.** Do not look the amount up later
  from your price list — the list changes, and the customer bought what was on
  offer that day.
- **A refund removes the credits.** Decide up front what happens when the
  balance has already been spent: going negative is honest, refusing is
  defensible, silently ignoring it is neither. Write the choice down.

## Step 3 — spending: check, work, charge — in that order

```
1. CHECK    is the balance sufficient?     -> if not, refuse before doing anything
2. WORK     do the expensive thing
3. CHARGE   deduct, write a ledger row
```

Charging first bills for work that then fails. Doing the work with no check in
front gives the result away for free, because by the time the deduction fails
the expensive part has already run. **That is the mistake that actually gets
made.**

Four rules around it:

- **The charge function must not take a member id.** The account charged is
  always the caller's own, from the session. An id read out of a request body is
  a way to drain somebody else's balance — and an optional parameter that
  defaults to the session does not close it, it only makes the bad call compile
  again. Charging on behalf of someone else is a *different* function, with an
  operator check at the top.
- **The price is yours, computed server-side.** Read the amount from the request
  and the customer sets it to zero.
- **Hold a row lock (or an atomic conditional update) while deducting**, so two
  concurrent requests cannot drive a balance below zero.
- **It is not idempotent.** Two submissions charge twice — there is no key to
  deduplicate on. Disable the button while the request is in flight, and never
  build a blind retry around it.

## Step 4 — automatic top-up

Digistore24 can charge a stored payment method without the customer present:
**`createBillingOnDemand`** against the original purchase.

It only works if the purchase stored payment details, which for a one-off means
sending `settings[force_rebilling]=Y` on the buy URL (see **`ds24-checkout`**).
Decide that at checkout time — it cannot be added afterwards.

Five boundaries:

- **The customer must have agreed** to being charged again, in words, before
  the first automatic charge. This is a payment authorisation, not a setting.
- **One charge in flight at a time.** Mark the account while a top-up is
  outstanding and clear it when the IPN confirms, or a slow response becomes two
  charges.
- **Count the charges the IPN never confirmed, and stop after two.** This is the
  one that bites, and it bites *because* of the boundary above.

  The mark has to expire — a process that dies holding it would freeze the
  account for ever. But now think about the IPN that never arrives at all: the
  card was charged, the balance was never credited, so the balance is still
  under the threshold, and the moment the mark expires the next spend charges
  the card **again**. And again. For as long as the customer's balance stays
  low, which is for ever, because the credit that would raise it is the thing
  that never came.

  Digistore24 allows ten charges a day per purchase, so its limit does not save
  you: a six-hour expiry gives four charges a day and stays comfortably under
  it.

  **Nothing about this looks like a fault.** Every charge SUCCEEDS. No error is
  thrown, no request fails, and the customer's own auto-top-up setting still
  reads "on". The only anomaly is a credit that did not arrive, and nothing
  watches for that unless you make it.

  So keep a counter next to the mark — charges since the last one that came back
  as a booked credit — increment it in the same atomic write that takes the
  mark, and refuse to charge once it reaches two. Reset it to zero when a credit
  actually books. Two rather than one, because a single unconfirmed charge is
  the normal state of every healthy top-up while the IPN is in flight, and
  Digistore24 is allowed to be slower than your expiry.

  **Pause, do not switch their setting off.** Nothing about what the customer
  asked for changed — only your confidence that the charge reaches them. It then
  resumes by itself the moment a credit books. And tell **yourself**, not them:
  their setting is still on and still correct, so put it where whoever supports
  this app will see it.
- **A failed top-up is not an error to hide.** Tell the customer their balance
  ran out and the top-up did not go through.
- **Never top up on somebody else's behalf.** If your app has any kind of
  "act as this customer" mode for support, suppress automatic charging inside it
  — there is nobody present to agree to a payment.

## Step 5 — prove it

1. Buy a credit package with a test purchase (cookie, or in development the
   testpay parameter — **`ds24-checkout`**, Step 4a) → balance credited **once**.
2. Send the same IPN again by hand → balance **unchanged**. (The verifier in
   **`ds24-ipn`** replays an event for exactly this reason, but it cannot see
   your balance — check this one by hand.)
3. Spend down to a shortfall → the action is refused **before** the expensive
   work, and no ledger row is written.
4. Refund the package → the credits come back out, the way you decided in
   Step 2.
5. **Trigger an automatic top-up and then throw the IPN away** — do not deliver
   it. Wait out your expiry, spend again, wait it out again, spend again. The
   card must be charged **twice and then never again**, and something you can
   read has to say which account it happened to. Skipping this one is how the
   loop in Step 4 ships: every other test passes with it in place, because
   every individual charge works.

## Step 6 — what comes next

- **`ds24-entitlements`** — if some things are gated rather than metered.
- **`ds24-compliance`** — the ledger holds notes about people; that has
  consequences.
- **`ds24-golive`** — the real test purchase.

Say which one you are starting and start it.
