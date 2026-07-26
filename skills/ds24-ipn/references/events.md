<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# What each Digistore24 event does to access

This is the table the whole integration hangs on. Get a row wrong and you either
lock out a paying customer or keep serving a refunded one.

| Event | What it means | What it does to access |
|---|---|---|
| `on_payment` | money arrived | **grants** access — and **lifts a suspension** if one is in place |
| `on_payment_subscription_signup` | the first payment of a subscription | **grants** access |
| `on_refund` | money went back | **ends** access, for good |
| `on_chargeback` | the bank clawed it back | **ends** access, for good |
| `on_payment_missed` | a rebill failed (expired card…) | **suspends** access — **reversible** |
| `on_rebill_resumed` | support restarted the rebilling | **lifts a suspension** — and nothing else |
| `on_rebill_cancelled` | buyer or support stopped the rebilling | **nothing at all** |
| `last_paid_day` | the paid period is over | **ends** access. This is how purchased access normally expires |
| `connection_test` | Digistore24 validating your endpoint | nothing — answer `200` |

## The two rows people get wrong

**`on_rebill_cancelled` does nothing.** It is sent the moment somebody cancels,
which for a yearly plan cancelled in month one is eleven months before access is
supposed to end. Billing stops; access runs on until it is paid out. Ending
access here takes away time the customer already paid for — and it is the single
most common way a Digistore24 integration produces refund requests.

**Access ends at `last_paid_day`, not at cancellation.** That event arrives when
the paid period is actually over, usually early in the morning. It is the
counterpart to the row above, and the two only make sense as a pair — keep them
next to each other in your code so nobody "simplifies" one of them away.

## Suspension is not cancellation

`on_payment_missed` is a customer whose card expired, not a customer who left.
Take access away **reversibly**: mark it suspended, do not mark it ended. When
the payment goes through, `on_payment` arrives and has to **lift** that
suspension.

Two consequences that are easy to miss:

- **The lift is not the same operation as the grant.** If your "grant access"
  path is an insert-if-absent, it writes nothing for a row that already exists —
  so the suspension survives the payment that answered it, and a customer who
  just paid stays locked out. Handle "already exists and is suspended"
  explicitly.
- **`on_rebill_resumed` may never create access.** It is a support click with no
  payment behind it. It lifts a suspension if there is one, and otherwise does
  nothing. Treating it as a payment hands out free access to anybody who once
  had a subscription.

## Ended is forever

Once access has ended — refund, chargeback, or the last paid day — **no later
event may reopen it.** Because delivery is unordered (see `ipn-protocol.md`), a
redelivered `on_payment` can arrive after the `on_refund`, and a support
"restart rebilling" can arrive months after expiry. Guard on the *state* of the
record, before you look at the event name at all.

Record **why** it ended (refund / chargeback / expiry). "Ended" alone cannot
tell a refund from a normal expiry, and those call for opposite answers when a
customer writes in.

## Do not decide from a status

It is tempting to map every event onto a small set of words — `paid`,
`cancelled`, `refunded` — and then decide access from that word. **Do not.**
`on_rebill_cancelled` and `last_paid_day` both mean "cancelled" to an order
record, and they mean opposite things to access. The mapping is lossy in exactly
the place where the loss costs money.

Keep the **raw event name** all the way to the decision. If you also keep an
order status for your own reporting, derive it separately — never route the
access decision through it.

## Access is its own record

Three things exist and they are not the same:

| Record | Answers | Never used for |
|---|---|---|
| **order** | did money move, how much, when | deciding access — it is a financial record |
| **subscription** | what Digistore24 believes about billing | deciding access — a cancelled subscription still has a paying customer behind it until `last_paid_day` |
| **access / entitlement** | may this person use this product | accounting |

Ask the access record, always. `deleted`/`cancelled` on a subscription is a
statement about *billing*, and the customer who cancelled yesterday is still
entitled today.

## One person can hold two plans at once

A Digistore24 plan switch stops the old rebilling and starts a new purchase. The
two events arrive **days apart, in either order**. During an upgrade a customer
therefore holds both plans — or, briefly, neither.

So: ask "does this person have plan X?" per feature. Never take "their plan" to
be the first entry in a list; an app that renders it that way shows the wrong
plan to every upgrading customer.

## A balance is not an entitlement

If you sell prepaid credits, a credit purchase is a **quantity**, not a right.
The access question answers `false` for it, forever, and correctly. Metering
usage is a separate mechanism — see the `ds24-tokens` skill.
