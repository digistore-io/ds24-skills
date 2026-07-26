---
name: ds24-compliance
description: Use when an app that takes money from EU customers needs its legal side in order — imprint, privacy policy, terms, the EU AI Act disclosure for anything that talks to people as a machine, whether a cookie banner is needed at all, consent records, and a customer's right to their data and to deletion. Use it whenever the user asks about GDPR, a cookie banner, an imprint, the AI Act, account deletion, or what they have to show before selling to real customers.
---

# What the EU asks of a paid app

This is preparation, not legal advice. It gets the obvious things right and
names the ones a lawyer should look at. Say that once, at the start, and then be
useful.

The trigger is not size. It is **taking money from people in the EU**, which is
what a Digistore24 integration is for.

## Step 0 — what is already there?

Look before writing anything. Search the project for an imprint, a privacy
policy, terms, a cookie banner, a consent table.

**Whatever exists, do not replace it.** Legal pages are frequently the one part
of an app a lawyer has already seen, and a rewritten privacy policy that reads
better and says something else is worse than a clumsy accurate one. Read what is
there, check it against the steps below, and report the gaps — changing the
wording is the user's decision, not yours.

A **cookie banner that is already installed** is the one thing worth
questioning out loud: Step 3 explains why an app like this usually needs none.

## Step 0a — is this copy of the skill pack current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with this pack's `VERSION`. Mention a mismatch in one sentence, then
carry on. Legal text ages faster than code — this is the skill where a stale
copy matters most.

## Step 1 — the inventory comes first

You cannot write a truthful privacy policy from imagination. **List what the app
actually stores about people**, table by table, before writing a word of policy:

- accounts: email, name, sign-in timestamps
- orders: buyer name, address, amount — from Digistore24
- raw IPN payloads: everything Digistore24 sent, including the buyer's details
- access grants and any operator notes on them
- ledger rows and their notes
- logs, and how long they are kept

For each: **why** you hold it, **how long**, and **who else sees it** —
Digistore24, the mail provider, the host, any AI provider. That list is the
document everything else is written from, and it has to be updated whenever a
table is added.

**Operator notes are personal data.** A note support wrote *about* a customer is
covered by an access request even though the app never shows it to them. Hiding
it in the UI is a decision about tone, not an exemption.

## Step 2 — the imprint

Under German DDG § 5 (and its equivalents elsewhere), a commercial site needs a
reachable imprint: name, address — **a real one, not a PO box** — email, phone
or an equivalent fast contact route, and where applicable the VAT ID and the
commercial-register entry.

Build the page and **fail loudly while it is empty**. A placeholder imprint that
ships is worse than none: it is visibly false information about who is selling.

## Step 3 — probably no cookie banner, and that is not laziness

**A purchase does not need consent.** It runs on GDPR Art. 6(1)(b) — performing
a contract — not on permission. And if the only things stored on the device are
the session, the language and the theme, those are strictly necessary under
§ 25 TDDDG and its equivalents.

So: **do not add a cookie banner to an app that sets no non-essential cookies.**
It asks for permission you neither need nor use, and it trains people to click
past the one that will matter later.

**When something genuinely does need consent** — an analytics tag, a marketing
mail, an embedded third-party widget — then:

- declare the **purpose**, separately per purpose
- record **who consented, to what wording, when** — and store a **version of
  the wording**, because changing the text means everyone consented to something
  else
- make the record **append-only**. A withdrawal is a new row, never an edit: you
  have to be able to *demonstrate* consent (Art. 7(1)), and a row you overwrote
  demonstrates nothing
- withdrawal must be as easy as giving it

## Step 4 — the AI disclosure is law, not copy

**EU AI Act Art. 50(1), applicable from 2 August 2026:** a system that
interacts with people must make clear that they are dealing with a machine, at
the latest at the first interaction.

If the app has a chat, an assistant, a generated reply — anything that talks to
a person as a machine — **it says so, visibly, in every language the app
speaks**. Not in the terms. Where the conversation happens.

Write it as a rule rather than a one-off: *anything here that talks to a person
as a machine says so*. Whatever AI feature gets added next inherits it.

## Step 5 — the customer's own data

Two obligations, and both are ordinary engineering once you have Step 1:

**Access (Art. 15).** One command or one button produces everything held about
one person. Search by **email address, not by account** — the people most likely
to ask are the ones who never got an account, because a purchase made without
signing in leaves their name on an order with no member id.

One documented exception: raw third-party webhook payloads may carry another
person's data and nobody is in between to redact them (Art. 15(4)). Leave them
out of the *customer-facing* export and keep them in the operator one.

**Deletion (Art. 17), and what it does not cover.** Deleting an account does not
delete everything, and the dialog has to say so:

- **Orders stay.** They are accounting records under a statutory retention
  period. Deleting one would be the violation, not the remedy. Sever the link to
  the account instead.
- **Everything else goes**, or is anonymised.
- **A running subscription warns and does not block.** Refusing erasure because
  it is inconvenient is the violation. But billing that continues at Digistore24
  with no account behind it is worth one loud sentence — and a link to cancel.
- The deletion action takes **no id from the request**: always the caller's own
  account.

## Step 6 — terms, and the right of withdrawal

Selling to consumers in the EU means a withdrawal right, and for digital
content it means asking the buyer to agree to immediate delivery — otherwise the
period runs and access has already been handed over. Digistore24 handles much of
this at checkout as the merchant of record; **confirm what it covers for this
account rather than assuming either way**, and say what you confirmed.

## Step 7 — what to hand over

Leave behind, in the repository:

1. the inventory from Step 1, as a file that gets updated with every new table
2. the imprint, privacy policy and terms as real pages
3. a dated note of what was checked, what was decided and what is still open

That last one is the difference between "we thought about it" and being able to
show it.

## Step 8 — what comes next

If this ran before launch, go back to **`ds24-golive`** and finish the test
purchase. If the app is already live, the honest next step is a lawyer looking
at the pages you just wrote.
