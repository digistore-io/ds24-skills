<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Start here

**Version 1 · 2026-07-28** — say which version you are following if anything below
goes wrong; it makes the answer findable.

You are reading this because somebody pasted a prompt into you that said *"read
https://ds24-skills.com/start.md and follow it"*. They want the app you are
building for them to **take money through Digistore24** — a checkout, a webhook
that says what was paid, and a paid area that opens when it was.

There is a finished set of **Agent Skills** for exactly that: **ds24-skills**.
Eight of them, covering the signature algorithm, the event semantics, the failure
modes and frozen test vectors that prove the result. Your job is not to work any
of that out. Your job is to get those skills in front of yourself, and then use
them.

**Follow this file to the end of one branch, then stop reading it.** Everything
past that point is in the skills, and it is written better there because it is
kept current with them. Nothing about how Digistore24 works belongs here.

---

## Step 1 — work out what you are

Do not guess this. Ask if you are unsure.

**Can you run shell commands where this app lives?**

- **Yes** — Replit, v0, Codex, Claude Code, Cursor, Manus, or a terminal on
  somebody's own machine. → **Branch A**.
- **No, but I am building an app** — Lovable, or any builder that writes app
  files for you without giving you a shell. → **Branch B**.
- **No, and there is no app here either** — you are a plain chat: claude.ai,
  ChatGPT, Gemini in a browser. → **Branch C**.

Say which one you concluded, in one line, before you continue. If you get this
wrong the person will follow instructions that cannot work.

---

## Branch A — you have a shell

### A1. Install the skills

```bash
npx skills add digistore-io/ds24-skills
```

That puts them in `.agents/skills/` — where Replit's agent looks — and links them
into `.claude/skills/` for Claude Code. The adapters, the references, the frozen
vectors and the ready-made checker come along.

If the installer is unavailable or unwelcome, the manual route is a copy:

```bash
curl -sSL -o /tmp/ds24.zip https://github.com/digistore-io/ds24-skills/archive/refs/heads/main.zip
unzip -q /tmp/ds24.zip -d /tmp
mkdir -p .agents/skills && cp -r /tmp/ds24-skills-main/skills/* .agents/skills/
```

### A2. Start using them

Read `ds24-billing` first — it is the entry point. It looks at what the project
already has, names the one next step and starts the skill that does it.

**Do not come back to this file.** It knows how to get the skills; the skills know
everything else.

---

## Branch B — you build the app, but you cannot install skills

**Say this in your first sentence, before anything else:** you cannot install
these skills yourself. On Lovable they live in the person's workspace, not in the
repository, and the only thing that puts them there is them clicking. Pretending
otherwise wastes their afternoon.

Then do these three things, in this order.

### B1. Tell them the clicks

Name the one for the platform you are actually in. If you do not know which,
ask — do not print both and leave them to guess.

**Lovable** — *Skills → Add → Import from GitHub*, and paste:

```
https://github.com/digistore-io/ds24-skills
```

That is the whole installation. Lovable pulls the skills straight from the
repository: no download, no unpacking, nothing installed on their machine.

**Manus, through the interface** — download
`https://github.com/digistore-io/ds24-skills/archive/refs/heads/main.zip`, unpack
it, then *Skills → + Add → Upload a skill* and drop in the `skills` folder from
inside. If it wants one at a time, `ds24-billing` and `ds24-ipn` first.

### B2. Do not make them wait for it

While they are doing that, you can read what you need. The pack is public, and
every file is fetchable:

```
https://raw.githubusercontent.com/digistore-io/ds24-skills/main/skills/ds24-billing/SKILL.md
```

Start with `ds24-billing` and follow it — it will name the next skill, and those
are at the same address with the folder name swapped: `ds24-products`,
`ds24-ipn`, `ds24-entitlements`, `ds24-checkout`, `ds24-tokens`, `ds24-golive`,
`ds24-compliance`.

**Two things about doing it this way, and say both out loud:**

- It lasts for **this conversation only**. Nothing has been installed, so the next
  session starts empty again. The import in B1 is what makes it stick — it is
  worth doing even though you are already working.
- **If you cannot fetch that address, say so and stop here.** Go back to B1, wait
  for the import, and do not reconstruct the billing from memory. What these
  skills carry is precisely the part that looks obvious and is wrong — an agent
  guessing it writes an integration whose own tests pass and whose every real
  payment is refused.

### B3. Hand over

Once the import is done, the whole instruction is *"add Digistore24 billing to
this app"* — or the skill by name, `ds24-billing`. From there the skills speak
for themselves.

---

## Branch C — a chat with no app in it

Be straight about it: you have no app here to build into, and these skills are
instructions for an agent that does.

What you can usefully do is hand them the prompt for a program that has one. Any
of **Lovable, Manus, Replit, v0, Claude Code or Codex** works. Give them this to
copy:

```
Read https://ds24-skills.com/start.md and follow it.
Add Digistore24 billing to this app.
```

If what they actually want is a whole SaaS rather than billing bolted onto
something they already have, that is a different product and a better fit:
**https://ds24-appkit.com** — a finished Next.js SaaS with all of this built in
already.

---

## What this file is not

It is a doorway, and it stays a doorway. It does not describe the signature, the
events, the entitlements or any other part of billing through Digistore24 — all
of that lives in the skills and changes with them. A copy of it here would be
wrong within a month, and wrong at a memorable address is worse than absent.
