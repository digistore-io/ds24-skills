# Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
# SPDX-License-Identifier: MIT
#
# The Digistore24 IPN signature — Python (standard library only).
#
# COPY THIS FILE VERBATIM. DO NOT EDIT IT.
#
# It is deliberately separate from the endpoint adapter: that one is an example
# you adapt to your app, this is the part that must not drift. Every line is
# checked against frozen test vectors (../scripts/vectors.json) shared with the
# Digistore SAAS App Template — so an implementation that reproduces them is
# provably computing what Digistore24 computes.
#
# No third-party imports on purpose: it works in Django, FastAPI, Flask or a
# bare script, and nothing about your dependency tree can change what it does.
#
# The reasoning behind every step is in ../references/ipn-protocol.md.

import hashlib
import hmac


def digistore_sha_sign(params: dict[str, str], passphrase: str,
                       uppercase_keys: bool = False) -> str:
    """Compute the Digistore24 SHA512 signature. Returns uppercase hex.

    uppercase_keys mirrors Digistore24's `convert_keys_to_uppercase` switch.
    Its own default is False — the ORIGINAL field-name case.
    """
    prepared = [
        (key.upper() if uppercase_keys else key, value)
        for key, value in params.items()
        # 1. sha_sign / SHASIGN carry the signature and were not part of it.
        if key.upper() not in ("SHA_SIGN", "SHASIGN")
    ]
    # 2. Byte order — PHP's ksort($p, SORT_STRING). Python's default str
    #    comparison is exactly that. Do not reach for locale.strxfrm or
    #    casefold(): both reorder keys that differ only in case or in "_".
    prepared.sort(key=lambda kv: kv[0])

    sha_string = ""
    for key, value in prepared:
        # 3. An empty value contributes nothing — not even its key.
        if value is None or value == "":
            continue
        # 4. The passphrase ends EVERY pair, not just the last one.
        sha_string += f"{key}={value}{passphrase}"

    # 5. SHA512 over the UTF-8 bytes, uppercase hex. The explicit encoding is
    #    load-bearing: a buyer called "Jörg Müller" hashes differently under
    #    latin-1, and only the purchases with non-ASCII names would fail.
    return hashlib.sha512(sha_string.encode("utf-8")).hexdigest().upper()


def verify_ipn_signature(params: dict[str, str], passphrase: str) -> bool:
    """Verify an IPN payload.

    Fails closed: a missing signature or a missing passphrase is a rejection,
    never a bypass.

    Tries BOTH key-case conventions. Digistore24 signs with the original case,
    but an account configured the other way is legitimate — and both variants
    require the secret passphrase, so accepting either costs no security.
    """
    received = params.get("sha_sign") or params.get("SHASIGN")
    if not received or not passphrase:
        return False

    target = received.upper()

    for uppercase_keys in (False, True):
        # 6. compare_digest is the constant-time comparison.
        if hmac.compare_digest(target, digistore_sha_sign(params, passphrase, uppercase_keys)):
            return True
    return False
