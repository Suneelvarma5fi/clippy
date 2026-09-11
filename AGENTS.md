# For AI agents setting up or working on Clippy

**Setting it up:** follow `docs/SETUP.md` top to bottom. Every step ends with a
checkpoint command and its expected output — run each one and do not proceed
past a failing checkpoint. The worker lists every missing env var at boot, so
run it early to find gaps.

**Working on the code:** `CLAUDE.md` holds the engineering guidelines. The web
app is Next.js 16 — read `web/AGENTS.md` before touching it. Tests: `npm test`
in `web/`, and `.venv/bin/python test_<name>.py` per file in `worker/`.
