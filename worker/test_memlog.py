"""Tests for pipeline.memlog — RSS instrumentation."""
import logging

from pipeline.memlog import log_rss, rss_mb

# rss_mb returns a plausible resident-set size for a live Python process
v = rss_mb()
assert isinstance(v, float), f"expected float, got {type(v)}"
assert v > 1, f"RSS should be at least a few MB, got {v}"

# log_rss returns the measurement and emits one INFO record with the stage tag
records: list[logging.LogRecord] = []


class _Capture(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        records.append(record)


memlog_logger = logging.getLogger("pipeline.memlog")
handler = _Capture()
memlog_logger.addHandler(handler)
memlog_logger.setLevel(logging.INFO)
try:
    v2 = log_rss("test-stage")
finally:
    memlog_logger.removeHandler(handler)

assert v2 > 1, f"log_rss should return the RSS reading, got {v2}"
assert len(records) == 1, f"expected 1 log record, got {len(records)}"
msg = records[0].getMessage()
assert "test-stage" in msg and "MB" in msg, f"unexpected log message: {msg}"

print("test_memlog: all assertions passed")
