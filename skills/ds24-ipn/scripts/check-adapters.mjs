#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT
//
// check-adapters.mjs — proves that every signature module in this pack computes
// the same thing.
//
// Three implementations ship here: Node (node:crypto), Web Crypto (Deno,
// Supabase Edge Functions, Cloudflare Workers) and Python (stdlib). They are
// separate files because the runtimes have nothing in common, and separate
// files are exactly where a payment integration silently drifts apart. So all
// three are measured against one frozen set of vectors — vectors.json, which
// the Digistore SAAS App Template's own test suite reads as well.
//
// If this is green, an IPN that verifies in one runtime verifies in all of
// them, and in the template. That is the whole claim.
//
// Usage:  node check-adapters.mjs
//
// Python is checked when a `python3` is on PATH and skipped, loudly, when it is
// not. The Web Crypto module is executed here on Node's own Web Crypto — the
// same global API Deno implements, which is why one file serves both.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { digistoreShaSign as signNode } from "../adapters/signature-node.mjs";
import { digistoreShaSign as signWeb } from "../adapters/signature-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const adapters = path.join(here, "..", "adapters");
const data = JSON.parse(readFileSync(path.join(here, "vectors.json"), "utf8"));

let failed = 0;
const report = (impl, name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${impl.padEnd(18)} ${name}${detail ? `\n    ${detail}` : ""}`);
};

// ── signature-node.mjs ───────────────────────────────────────────────────────
for (const v of data.vectors) {
  const got = signNode(v.params, data.passphrase, v.uppercaseKeys);
  report("signature-node", v.name, got === v.expected,
    got === v.expected ? null : `expected ${v.expected}\n    got      ${got}`);
}

// ── signature-web.mjs ────────────────────────────────────────────────────────
for (const v of data.vectors) {
  const got = await signWeb(v.params, data.passphrase, v.uppercaseKeys);
  report("signature-web", v.name, got === v.expected,
    got === v.expected ? null : `expected ${v.expected}\n    got      ${got}`);
}

// ── signature.py ─────────────────────────────────────────────────────────────
let python = "python3";
try {
  execFileSync(python, ["--version"], { stdio: "ignore" });
} catch {
  python = null;
}

if (!python) {
  console.log(
    "○ signature.py      SKIPPED — no python3 on PATH.\n" +
    "    The Python module was NOT checked. Do not read this run as covering it.",
  );
} else {
  const script = `
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location("sig", ${JSON.stringify(path.join(adapters, "signature.py"))})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
data = json.load(open(${JSON.stringify(path.join(here, "vectors.json"))}))
out = []
for v in data["vectors"]:
    got = m.digistore_sha_sign(v["params"], data["passphrase"], v["uppercaseKeys"])
    out.append({"name": v["name"], "ok": got == v["expected"], "got": got, "expected": v["expected"]})
print(json.dumps(out))
`;
  // -B: kein Bytecode. Ohne das legt Python ein __pycache__ NEBEN signature.py
  // an — also mitten in den Skill-Ordner, den der Nutzer gerade installiert hat.
  // Auf Lovable und Manus zaehlt jede Datei gegen das Import-Limit, und eine
  // .pyc, die niemand angefordert hat, ist dort schlicht Muell. Ein Pruefer darf
  // nichts hinterlassen.
  const raw = execFileSync(python, ["-B", "-c", script], { encoding: "utf8" });
  for (const r of JSON.parse(raw)) {
    report("signature.py", r.name, r.ok,
      r.ok ? null : `expected ${r.expected}\n    got      ${r.got}`);
  }
}

console.log(failed === 0
  ? "\nAll signature modules agree with the frozen vectors."
  : `\n${failed} check(s) failed — the implementations have drifted apart.`);

process.exit(failed > 0 ? 1 : 0);
