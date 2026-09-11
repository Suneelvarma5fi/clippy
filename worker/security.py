"""
Auth brute-force guard for the worker API.

The worker only accepts requests carrying the shared x-worker-secret header;
this module stops bots from grinding at that secret: an IP accumulating too
many 401s inside the window gets 429'd before any handler runs.
"""

from __future__ import annotations
import time

AUTH_FAIL_LIMIT    = 10      # failed attempts allowed…
AUTH_FAIL_WINDOW_S = 600.0   # …per 10 minutes, per IP

_failures: dict[str, list[float]] = {}


def register_auth_failure(ip: str, now: float | None = None) -> None:
    t = time.monotonic() if now is None else now
    attempts = _failures.setdefault(ip, [])
    attempts.append(t)
    # keep only attempts inside the window
    _failures[ip] = [a for a in attempts if t - a < AUTH_FAIL_WINDOW_S]


def is_blocked(ip: str, now: float | None = None) -> bool:
    t = time.monotonic() if now is None else now
    attempts = _failures.get(ip)
    if not attempts:
        return False
    recent = [a for a in attempts if t - a < AUTH_FAIL_WINDOW_S]
    if not recent:
        del _failures[ip]
        return False
    _failures[ip] = recent
    return len(recent) >= AUTH_FAIL_LIMIT


def reset() -> None:
    """Test helper — clear all tracked failures."""
    _failures.clear()
