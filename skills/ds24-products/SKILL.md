---
name: ds24-products
description: Use when connecting an app to a Digistore24 account for the first time — getting the API key in, creating the products to sell, registering the IPN webhook connection, and requesting marketplace approval. Use it whenever the user mentions a Digistore24 API key, "connect Digistore", creating products or plans, registering an IPN URL, or asks why Digistore24 never calls their webhook.
---

# Connecting the app to Digistore24

Nothing about a Digistore24 integration works until three things exist on the
Digistore24 side: an API key your app can use, a product to sell, and an IPN
connection pointing at your endpoint. **Do this before anything else** — an IPN
handler nobody calls is untestable, and a checkout link for a product that does
not exist is a 404.

## Step 0 — what already exists?

Look before you ask:

- Is there a `DIGISTORE_API_KEY` in the environment or secret store?
- Is there a product registry in the project (a JSON/config file listing plans
  with prices)?
- Is `DIGISTORE_IPN_PASSPHRASE` set?

Then ask the user only what is genuinely missing. If all three are there, go to
Step 4 and check the connection rather than rebuilding it.

## Step 0a — is this copy of the skill pack current?

Fetch `https://raw.githubusercontent.com/digistore-io/ds24-skills/main/VERSION`
and compare with the `VERSION` file in this pack. Mention a mismatch in one
sentence, then carry on.

## Step 1 — the API

```
POST https://www.digistore24.com/api/call/<FUNCTION>/format/json
Header: X-DS-API-KEY: <the key>
Body:   application/x-www-form-urlencoded
```

**The key travels in the header, never as a form parameter.** It is a secret:
environment variable or the platform's secret store, never in the code, never in
anything the browser receives.

The user creates it themselves in their Digistore24 account under
*Settings → API keys*. Ask for it, tell them where to put it, and do not try to
scrape it out of a browser session.

## Step 2 — one price list, in your app

**Keep the plans in one file in your project** — key, display name, price in
cents, currency, billing interval — and let everything read from it: the pricing
page, the checkout, the entitlement check.

The price does **not** live on the Digistore24 product. Digistore24's API
discards `data[amount]` on `createProduct`/`updateProduct` ("deprecated — create
a payment plan instead"), and a payment plan stored at Digistore24 is fixed:
free trials, upgrades, downgrades, vouchers and per-link affiliate commissions
only work when the plan travels with the checkout call. So the price goes to
`createBuyUrl` at purchase time — see the **`ds24-checkout`** skill.

One price, one place. A second list in the code is a list that drifts.

## Step 3 — create the products

`createProduct` / `updateProduct` with the name, description and language.
Write the returned product id back into your price list so the mapping is
recorded, not re-derived.

Make this **idempotent**: run it twice and the second run updates rather than
creating a duplicate. Key it on your own product key, not on the name.

**Deleting a product from your list does not unpublish it.** A product
Digistore24 already knows stays buyable until the user deactivates it there.
Say that out loud when you remove one.

## Step 4 — register the IPN connection

This is the step that gets forgotten, and its symptom is "the purchase worked
but nothing happened in the app".

- `ipnSetup` registers the endpoint. Digistore24 **validates it immediately**
  with a `GET` and insists on HTTP `200` — a redirect (301/302) fails too.
- **The URL must be public `https`.** Digistore24 refuses `http` and refuses
  `localhost` outright.
- Digistore24 either generates the **IPN passphrase** or takes yours. Whichever
  it is, it must end up in the app's environment as
  `DIGISTORE_IPN_PASSPHRASE` — it is the shared secret the signature is
  computed with, and without it every IPN is correctly rejected.
- Make it idempotent by keeping a **stable domain id** and deleting the existing
  connection for that domain before creating the new one. Otherwise a changed
  URL leaves a stale connection behind and events go to an address that no
  longer answers.

**On a hosted AI-builder platform this is the easy part**, and it is worth
saying to the user: the preview/production URL of a Lovable, Replit, v0 or Manus
app is already public https, so the endpoint can be registered directly. On a
laptop it cannot — a local address needs a tunnel first.

## Step 5 — before real money: approval

A product can be **test-purchased** immediately, by the vendor, with the
Digistore24 test-purchase cookie set. That is how you verify the whole chain
without moving money.

Selling to the public additionally needs **marketplace approval**
(`approval_status=pending`) — request it only once the description and the app
are genuinely finished, because a half-built product gets rejected and the
second attempt is slower.

The **`ds24-golive`** skill walks that, including the test purchase.

## Step 6 — prove the connection

Do not report success from an API response alone. Check that:

1. `GET <your IPN url>` answers **200** from the public internet.
2. The product appears in the user's Digistore24 account.
3. `DIGISTORE_IPN_PASSPHRASE` is set in the app's environment — not just in a
   local file the deployed app never reads.

Then prove the endpoint itself — the **`ds24-ipn`** skill says what has to hold
and how to check it on this platform.

## Step 7 — what comes next

- **`ds24-ipn`** — the endpoint that receives the events (build it now if it
  does not exist).
- **`ds24-checkout`** — the buy link, with the price attached.
- **`ds24-golive`** — the test purchase that proves the whole chain.

Say which one you are starting and start it.
