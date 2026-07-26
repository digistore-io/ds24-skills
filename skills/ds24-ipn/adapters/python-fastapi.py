# Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
# SPDX-License-Identifier: MIT
#
# Digistore24 IPN endpoint — FastAPI (Python).
#
# TWO FILES, AND THE DIFFERENCE MATTERS:
#   ./signature.py  — the signature. Copy it verbatim, never edit it.
#   this file       — the endpoint. An EXAMPLE. Adapt it to your app.
#
# The trap specific to Python is encoding. Buyer names carry umlauts and
# accents, and Digistore24 signed the UTF-8 bytes; anything that decodes the
# body as latin-1 produces a different hash, and only the purchases with
# non-ASCII names fail. Hence the explicit .decode("utf-8") below and the
# .encode("utf-8") in signature.py — neither is decoration.
#
# The algorithm and the reasoning are in ../references/ipn-protocol.md; the
# event semantics are in ../references/events.md.

import logging
import os
from urllib.parse import parse_qsl

from fastapi import APIRouter, Request, Response

from .signature import verify_ipn_signature

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/ipn")
async def ipn_connection_check() -> Response:
    """Digistore24 validates a newly registered endpoint with a GET."""
    return Response(content="OK", status_code=200)


@router.post("/ipn")
async def ipn(request: Request) -> Response:
    passphrase = os.environ.get("DIGISTORE_IPN_PASSPHRASE", "")

    # The RAW body, parsed here. Digistore24 posts form-encoded, not JSON.
    # keep_blank_values=True so an empty field still appears — step 3 of the
    # algorithm is what drops it, and it has to drop it the same way
    # Digistore24 did.
    raw = (await request.body()).decode("utf-8")
    params = dict(parse_qsl(raw, keep_blank_values=True))

    if not verify_ipn_signature(params, passphrase):
        # 403, and nothing about why.
        return Response(content="invalid signature", status_code=403)

    event = params.get("event") or params.get("order_event") or ""
    if event == "connection_test":
        return Response(content="OK", status_code=200)

    await record_raw_ipn(raw, params)  # store BEFORE acting on it

    try:
        await handle_event(event, params)
    except Exception:
        # Never raise: Digistore24 retries until it gets a 200, so an exception
        # becomes an endless redelivery loop. Replay from the stored raw row.
        log.exception("[ipn] handler failed: event=%s order_id=%s",
                      event, params.get("order_id"))

    return Response(content="OK", status_code=200)


# --- What you implement ------------------------------------------------------
#
# See ../references/events.md. The mapping is identical in every adapter:
#
#   on_payment, on_payment_subscription_signup → grant, and LIFT a suspension
#   on_refund                                  → end, reason "refund"
#   on_chargeback                              → end, reason "chargeback"
#   on_payment_missed                          → suspend (reversible!)
#   on_rebill_resumed                          → lift a suspension, nothing else
#   on_rebill_cancelled                        → NOTHING
#   last_paid_day                              → end, reason "lastPaidDay"
#   anything else                              → accept, change nothing
#
# Two invariants that are not visible in the mapping:
#   - every write is idempotent, keyed on (order_id, event) with a UNIQUE
#     constraint — not a SELECT followed by an INSERT
#   - once access has ended, no later event may reopen it

async def record_raw_ipn(raw: str, params: dict[str, str]) -> None:
    raise NotImplementedError("store the raw payload verbatim")


async def handle_event(event: str, params: dict[str, str]) -> None:
    raise NotImplementedError("implement the mapping above")
