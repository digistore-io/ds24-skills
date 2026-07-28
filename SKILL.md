---
name: ds24-skills
description: Use when an app has to take money through Digistore24 — a checkout or buy button, a paywall, a subscription, prepaid credits, the IPN webhook that says what was paid, going live, or a Digistore24 integration that misbehaves (signature invalid, a purchase that unlocked nothing, a refunded customer who still has access). This is the Digistore24 Skill Pack, which carries eight skills and starts the one the task needs. Use it whenever Digistore24 is named, and whenever billing, payments or a paid area come up and Digistore24 is the provider.
---

# The Digistore24 Skill Pack

Digistore24 is the merchant of record: it runs the checkout, takes the money,
handles VAT and refunds, and tells your app what happened through a signed
webhook. This pack is the part of that an agent cannot guess — the signature
algorithm, the event semantics, the failure modes, and frozen test vectors that
prove the result.

**This file is the door, not the manual.** It says what is here and how to read
it. Nothing about how Digistore24 works belongs on this page — that is in the
eight skills, and it is written better there because it is kept current with
them.

## Step 1 — is this copy current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare it with the `VERSION` file next to this one. Skills imported into a
workspace do not update themselves, so a copy can be months old. Mention a
mismatch in one sentence, offer to re-import, then carry on either way.

## Step 2 — read the entry point and follow it

```
skills/ds24-billing/SKILL.md
```

`ds24-billing` looks at what the project already has, names the one next step and
starts the skill that does it. Read it now — do not plan the integration from
this page, and do not ask the user questions it answers by looking.

## Step 3 — how to read any of the eight

They are files in this skill. Try these in order, and say which one worked if
the first one did not:

1. **`skills/<name>/SKILL.md`** — the copy that travelled with this skill.
2. **`https://raw.githubusercontent.com/digistore-io/ds24-skills/main/skills/<name>/SKILL.md`**
   — the same file from GitHub, if your platform did not keep the bundled
   folders. The files a skill carries hang off the same address, with its
   `references/…`, `scripts/…` or `adapters/…` entry appended.

**If neither works, stop and say so.** Do not reconstruct a Digistore24
integration from memory. What these skills carry is precisely the part that looks
obvious and is wrong — guessed, the result is an integration whose own tests pass
and whose every real payment is refused as "signature invalid".

## The eight

| Skill | Read it when |
|---|---|
| **`ds24-billing`** | **always first** — it works out what exists and starts the right one |
| `ds24-products` | the API key, creating products, registering the IPN connection |
| `ds24-ipn` | the webhook: signature, events, idempotency — and how to prove it |
| `ds24-entitlements` | turning a paid order into "may use the product" |
| `ds24-checkout` | the buy link, the price as a payment plan, the thank-you page |
| `ds24-tokens` | prepaid credits, spending them, automatic top-up |
| `ds24-golive` | pre-flight, the real test purchase, and the refund that proves the rest |
| `ds24-compliance` | imprint, privacy policy, the EU AI Act disclosure, deletion |

## Two things to carry into every one of them

**Access comes from a signed event, never from a browser.** A thank-you page is
a URL anybody can open. Only the IPN, whose signature you verified, may grant
anything.

**Prove it, do not report it.** Every skill ends with something that can be run.
The eight frozen vectors in `skills/ds24-ipn/scripts/vectors.json` may never be
recomputed with your own code — the bug they catch produces an implementation
that agrees with itself perfectly and rejects every real payment, so a test
written from the same misunderstanding confirms the bug. Reproduce them exactly.

## Where there is a shell

This file exists for platforms that import one skill at a time — Lovable and
Manus — so that a single import brings all eight. Where a command line is
available, installing them as eight separate skills is better, because each then
loads on its own trigger:

```
npx skills add https://github.com/digistore-io/ds24-skills/tree/main/skills
```

That address ends in `/skills` on purpose: pointed at the repository itself, the
installer stops at this file and installs this one skill instead of the eight.
