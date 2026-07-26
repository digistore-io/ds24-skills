---
name: ds24-entitlements
description: Use when deciding what a paying customer may actually use — the access record that Digistore24 events write to, and the one function the rest of the app asks. Covers why access is not the order table and not the subscription table, how to gate a page or a feature, upgrades where somebody holds two plans at once, and a paused plan after a missed payment. Use it whenever the user asks how to check if someone has paid, how to lock a feature behind a plan, or reports that a cancelled customer lost access too early.
---

# What a paying customer may use

There is one question the app asks — *may this person use this thing?* — and it
must have exactly one answer, in one place. Every version of this that goes
wrong went wrong by asking a different table.

## Step 0 — is it already there?

Search for an access, entitlement or grant table, or for a check like
`hasPlan(...)`. If something exists, do not build a second one — check it
against Step 2 and Step 3.

## Step 0a — is this copy of the skill current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with this pack's `VERSION`. Mention a mismatch in one sentence, then
carry on.

## Step 1 — three records, and only one of them answers

| Record | Answers | Must never decide access |
|---|---|---|
| **order** | did money move, how much, when | it is a financial record |
| **subscription** | what Digistore24 believes about billing | a cancelled subscription still has a paying customer behind it until the paid period ends |
| **access / grant** | **may this person use this product** | — |

The middle row is the trap. Somebody cancels on day 3 of a yearly plan;
Digistore24 reports the subscription as cancelled immediately; the customer has
eleven months left. An app that gates on subscription status locks them out that
afternoon, and the refund request is entirely justified.

**Keep a separate access record.** Minimum shape:

```
access_grants
  member_id      who
  product_key    what
  source         'purchase' | 'manual'
  order_id       which purchase it came from (null for manual)
  suspended_at   set by on_payment_missed, cleared by on_payment  (reversible)
  ended_at       set by refund / chargeback / last_paid_day       (terminal)
  ended_reason   'refund' | 'chargeback' | 'lastPaidDay' | 'revoked'
  access_until   an end DATE, for manual grants only — null for purchases
  unique (member_id, product_key, order_id)
```

The IPN maintains it. Nothing else writes to it except a deliberate manual
grant. Which event does what is the event table in the **`ds24-ipn`** skill —
read it there before writing any of this. If that skill is not installed, this
one cannot be finished correctly: install it too.

## Step 2 — one function, asked per feature

```
hasAccess(memberId, productKey) -> boolean
```

True when a row exists for that pair with `ended_at IS NULL` **and**
`suspended_at IS NULL` **and** (`access_until IS NULL` or `access_until > now`).

Every gate in the app calls it. No page reads the grants table itself, and no
page reads orders or subscriptions to decide anything.

**Ask it per feature, not once per user.** A Digistore24 plan switch stops the
old rebilling and starts a new purchase, and the two events arrive **days apart,
in either order** — so during an upgrade a customer holds *both* plans, or
briefly *neither*. Code that takes "their plan" to be the first entry in a list
shows the wrong plan to every upgrading customer.

## Step 3 — three rules that are not obvious

**A missed payment must not read as an account closure.** When `suspended_at` is
set, `hasAccess` correctly says false — and the customer sees a product that has
simply vanished. Give the UI a second, display-only question ("is this
paused?") and say *your access is paused, the last payment did not go through*.
Never nothing at all.

**`access_until` needs an explicit UTC timezone when rendered.** Store the end
of the day it covers and render it pinned to UTC — otherwise every viewer ahead
of UTC reads the following day. Give `null` a real sentence ("no end date"),
never a blank cell.

**A prepaid balance is not an entitlement.** `hasAccess` answers false for a
credit package forever, and that is correct: a plan is a right, a balance is a
quantity. See **`ds24-tokens`**.

## Step 4 — manual grants, because support needs them

Somebody will pay outside the system, or a purchase will fail to attribute.
Allow an operator to grant access by hand, with `source = 'manual'` and a
written reason.

Two boundaries worth building in from the start:

- **Only manual grants may be revoked by hand.** Purchased access ends by
  Digistore24 event, never by a click — otherwise support can take away
  something a customer paid for with no refund attached.
- **Enforce that in the write itself**, not only in the UI that hides the
  button. Any handler is an HTTP endpoint of its own.

## Step 5 — prove it

Run the verifier from the **`ds24-ipn`** skill with `--probe` pointed at a small
endpoint backed by `hasAccess`. That is exactly what its access checks test: a
refund removes access, a cancellation does not, a missed payment suspends
reversibly, and a redelivered payment does not revive a refunded order.

If the verifier says `SKIP` on those, none of the above has been tested — say so
rather than reporting it as done.

## Step 6 — what comes next

- **`ds24-tokens`** — if usage is metered rather than gated.
- **`ds24-golive`** — the real test purchase.
- **`ds24-compliance`** — what you now store about people, and what that
  obliges you to.

Say which one you are starting and start it.
