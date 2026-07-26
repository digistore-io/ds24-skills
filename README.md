<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Digistore24 Skills

**Agent Skills that teach any AI coding agent how to bill through Digistore24 —
in whatever app it is building, on whatever stack.**

Works with **Lovable**, **Manus**, **Replit**, **v0**, **Claude Code**, **Codex**
and anything else that reads the `SKILL.md` convention.

This is not a template and not a library. It is the part of a payment
integration that an agent cannot guess — the signature algorithm, the event
semantics, the failure modes — plus a script that **proves** the result is
correct rather than asserting it.

---

## Install

**No git, no terminal on the two platforms that do not have one.** Pick your row.

### Lovable — paste one address

*Skills → Add → Import from GitHub*, and paste:

```
https://github.com/digistore-io/ds24-skills
```

That is the whole installation. Lovable pulls the skills straight from the
repository — no download, no unpacking, nothing installed on your machine.

### Manus — download and upload

1. **[Download the pack as a ZIP](https://github.com/digistore-io/ds24-skills/archive/refs/heads/main.zip)**
   *(github.com/digistore-io/ds24-skills/archive/refs/heads/main.zip)*
2. Unpack it. Inside you get `ds24-skills-main/skills/` with one folder per skill.
3. In Manus: *Skills* in the left sidebar → **+ Add → Upload a skill** → drop in
   that `skills` folder.

If Manus wants one skill at a time, start with **`ds24-billing`** (the entry
point) and **`ds24-ipn`** (the one that does the work) — the rest can follow
whenever you need them. Invoke one directly with `/ds24-billing`.

### Replit, v0, Claude Code, Codex — one command

```bash
npx skills add digistore-io/ds24-skills
```

It installs into `.agents/skills/` — which is exactly where Replit's Agent looks
— and links them into `.claude/skills/` for Claude Code. The bundled adapters,
references and the verifier come along with it.

<details>
<summary>Rather not run an npx package?</summary>

Fair — the installer says it itself: skills run with full agent permissions, so
read them first. The manual route is a copy:

```bash
curl -sSL -o /tmp/ds24.zip https://github.com/digistore-io/ds24-skills/archive/refs/heads/main.zip
unzip -q /tmp/ds24.zip -d /tmp
mkdir -p .agents/skills && cp -r /tmp/ds24-skills-main/skills/* .agents/skills/
```

Use `.claude/skills/` instead of `.agents/skills/` for Claude Code.
</details>

---

Then say **"add Digistore24 billing to this app"** — or invoke the entry point
by name, `ds24-billing`.

---

## What is in it

| Skill | What it does |
|---|---|
| **`ds24-billing`** | the entry point: works out what already exists and starts the right next skill |
| **`ds24-products`** | API key, creating products, registering the IPN connection, approval |
| **`ds24-ipn`** | the webhook: signature, events, idempotency — **and the verifier** |
| **`ds24-checkout`** | the buy link, the price as a payment plan, carrying the buyer's identity |
| **`ds24-entitlements`** | the access record and the one function the app asks |
| **`ds24-tokens`** | prepaid credits, spending them, automatic top-up |
| **`ds24-golive`** | pre-flight, the real test purchase, and the refund that proves the other half |
| **`ds24-compliance`** | imprint, privacy policy, the EU AI Act disclosure, access and deletion |

## The three things an agent cannot guess

1. **Digistore24 signs with the ORIGINAL field-name case** (`order_id=…`), not
   uppercased — even though its own PHP example suggests otherwise. Get this
   wrong and every one of your own tests passes while every real payment is
   rejected as "signature invalid".
2. **`on_rebill_cancelled` does nothing to access.** Billing stops; the paid
   period runs on. Ending access there takes away months the customer paid for.
   Access ends at `last_paid_day`.
3. **A missed payment suspends reversibly.** An expired card is not a departure,
   and the payment that fixes it must *lift* the suspension — an
   insert-if-absent will not.

## The verifier

Text cannot guarantee that an agent built the signature check correctly, and
"probably right" is worthless for a payment rail. So the pack ships a script
that speaks only HTTP and therefore runs against a Supabase Edge Function on
Lovable Cloud exactly as it runs against a Next.js route on Replit:

```bash
node skills/ds24-ipn/scripts/verify-ipn.mjs \
  --url https://your-app.example.com/api/ipn \
  --passphrase "$DIGISTORE_IPN_PASSPHRASE" \
  --probe https://your-app.example.com/api/ds24-selftest --probe-token "$SECRET"
```

It checks its own signing against frozen vectors first, then sends real signed
payloads:

| Case | Must |
|---|---|
| correctly signed `on_payment` | be accepted, access granted |
| one flipped byte in the signature | be rejected |
| no signature, or no passphrase | be rejected (fail closed) |
| uppercase-key signature | be accepted |
| the same event twice | not credit twice |
| `on_refund` | remove access |
| `on_payment_missed` → `on_payment` | suspend, then restore |
| `on_rebill_cancelled` | leave access **unchanged** |
| a payment redelivered after a refund | **not** revive access |

The access half needs `--probe`: a small, token-protected endpoint answering
`{"access": true|false}` for an `order_id`, which you delete once the run is
green. Without it those checks report `SKIP` and say so — they are never
silently counted as passes.

To check the shipped signature modules on their own, in all three runtimes:

```bash
node skills/ds24-ipn/scripts/check-adapters.mjs
```

The vectors it uses are shared with the [Digistore SAAS App
Template](https://github.com/digistore-io/ds24-appkit), so the implementations
here cannot drift away from the one running in production apps.

## Adapters

`skills/ds24-ipn/adapters/` holds two kinds of file, and the difference matters:

**The signature — copy verbatim, never edit:**

| Runtime | File |
|---|---|
| Node | `signature-node.mjs` |
| Deno · Supabase Edge Functions · **Lovable Cloud** · Cloudflare Workers | `signature-web.mjs` |
| Python | `signature.py` |

**The endpoint — an example you adapt:** `next-node.ts`, `deno-edge.ts`,
`express-node.js`, `python-fastapi.py`.

> **On Lovable Cloud / Supabase, deploy the function with `verify_jwt = false`.**
> Digistore24 sends no Supabase JWT, so with the default on, every IPN gets a
> 401 before your code runs and every purchase silently unlocks nothing.

## Updating

**On Lovable and Manus, skills live in your workspace, not in your repository —
so they do not update themselves.** Whoever imported v1 keeps v1 until they
import again. Every skill therefore starts by comparing its own `VERSION`
against

```
https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION
```

and says something when they differ.

Everywhere else, updating is the same command that installed them:

```bash
npx skills add digistore-io/ds24-skills
```

## What this is not

- **It is not an app.** No authentication, no user table, no UI. Your agent
  builds those; these skills make the money part correct.
- **The verifier covers the money path**, not whether every page of your app
  checks permissions.
- **It is preparation, not legal advice.** `ds24-compliance` gets the obvious
  things right and names what a lawyer should see.

If you would rather start from a finished, working SaaS with all of this already
built in, that is a different product: **[ds24-appkit.com](https://ds24-appkit.com)**
— a complete Next.js SaaS template you extend with Claude Code.

## License

MIT — see [`LICENSE`](LICENSE). Use it, change it, ship products with it, sell
them. No fee, nobody to ask.
