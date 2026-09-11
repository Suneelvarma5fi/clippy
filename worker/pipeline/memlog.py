"""RSS instrumentation for locating the worker memory growth (diagnosis aid)."""
import logging

import psutil

log = logging.getLogger(__name__)

_proc = psutil.Process()


def rss_mb() -> float:
    return _proc.memory_info().rss / (1024 * 1024)


def log_rss(stage: str) -> float:
    mb = rss_mb()
    log.info("RSS [%s]: %.0f MB", stage, mb)
    return mb
