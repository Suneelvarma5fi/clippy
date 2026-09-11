# Setting up Clippy

A complete walkthrough from nothing to a first exported clip. Every step ends with a **Checkpoint** — a command and what it should print. Don't move past a failing checkpoint; each later step assumes the earlier ones hold.

Written to be followed by a person or an AI agent. Commands are for macOS/Linux `bash`; Windows differences are called out where they exist.

**Time:** ~30 minutes, mostly waiting for installs. **Cost:** Supabase and Cloudflare R2 are free at this scale; OpenRouter and Replicate bill per video processed (typically cents per video).

---

## 0. What you're building

Two processes on your machine talk to four hosted services:

| Process | Runs at | Role |
|---|---|---|
| `web/` — Next.js | `http://localhost:3000` | The UI and API routes |
| `worker/` — Python FastAPI | `http://127.0.0.1:8000` | Downloads, transcribes, cuts, renders |

| Service | Role |
|---|---|
| **Supabase** | Postgres database |
| **Cloudflare R2** | Media storage (S3-compatible). Source videos run to hundreds of MB, which rules out Supabase's own storage on the free plan — it caps files at 50 MB |
| **OpenRouter** | LLM calls for clip identification and social copy |
| **Replicate** | WhisperX transcription on a GPU |

Clippy runs as a **single local user with no sign-in** by default. Multi-user auth (Clerk) is optional and covered at the end.

---

## 1. Local prerequisites

You need **Node 20+**, **Python 3.12** (the version the Docker image and all testing use; newer may work but is untested), **ffmpeg**, and **git**. Windows users running the worker in Docker can skip Python and ffmpeg.

**macOS**
```bash
brew install node python@3.12 ffmpeg git
```

**Ubuntu / Debian**
```bash
sudo apt install -y ffmpeg git python3.12 python3.12-venv
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

**Windows** — install [Docker Desktop](https://www.docker.com/products/docker-desktop/) for the worker, plus:
```powershell
winget install OpenJS.NodeJS.LTS Git.Git
```
(Running the worker natively on Windows is possible but needs Visual C++ Build Tools for InsightFace. Docker is the supported path.)

**Checkpoint**
```bash
node --version && python3.12 --version && ffmpeg -version | head -1 && git --version
```
Expect: `v20.x` or higher, `Python 3.12.x`, an `ffmpeg version` line, a `git version` line. (Windows/Docker: only `node` and `git` need to succeed; also run `docker --version`.)

---

## 2. Supabase — database

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Pick any name and region. **Write down the database password** — you need it in step 2.3 and it is not shown again.
2. Wait for the project to finish provisioning (~2 min).

### 2.1 Collect the API values

**Project Settings → API**:

| Copy this | Into env var |
|---|---|
| **Project URL** (`https://<ref>.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` |
| **service_role** key (under "Project API keys" — click *Reveal*) | `SUPABASE_SERVICE_ROLE_KEY` |

The `<ref>` is the 20-character project id in the URL. You'll use it again for storage.

> The service_role key bypasses row security. It only ever lives in your local env files and is never sent to the browser.

### 2.2 Install the Postgres client

You need `psql` to apply the schema.

```bash
# macOS
brew install libpq && brew link --force libpq
# Ubuntu / Debian
sudo apt install -y postgresql-client
```
```powershell
# Windows
winget install PostgreSQL.PostgreSQL     # includes psql; reopen the terminal afterwards
```

### 2.3 Apply the schema

Get the host: dashboard → **Connect** (top bar) → **Session pooler** tab. The URI shown there contains `aws-0-<region>.pooler.supabase.com` — that region is your project's, and may differ from the storage region.

Set the connection as environment variables rather than pasting the password into a URI — a password containing `@`, `#`, `/` or `%` breaks a URI unless escaped, and `psql` reads these variables directly:

```bash
export PGHOST=aws-0-<region>.pooler.supabase.com PGPORT=5432
export PGUSER=postgres.<ref> PGDATABASE=postgres
export PGPASSWORD='<database password>'

for f in supabase/migrations/*.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -q -f "$f" || break
done
```
```powershell
# Windows
$env:PGHOST='aws-0-<region>.pooler.supabase.com'; $env:PGPORT='5432'
$env:PGUSER='postgres.<ref>'; $env:PGDATABASE='postgres'
$env:PGPASSWORD='<database password>'
Get-ChildItem supabase\migrations\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "== $($_.Name)"; psql -v ON_ERROR_STOP=1 -q -f $_.FullName
}
```

`NOTICE: ... already exists, skipping` lines are normal. Any `ERROR` stops the loop.

The files are numbered and must run in order. `017_drop_billing.sql` removes tables an earlier migration created — that is expected.

*Without psql:* open **SQL Editor** in the dashboard and paste each file's contents in order, running each one.

**Checkpoint**
```bash
psql -c "\dt" | grep -E "videos|clips|jobs|exports|presets|collections|clip_edits"
```
Expect seven table rows. `user_credits` and `credit_transactions` must **not** appear (017 dropped them).

---

## 3. Cloudflare R2 — storage

All video, audio and rendered clips go here over the S3 protocol. R2's free tier is 10 GB stored with no per-file limit and free egress. Sources are kept at the best quality YouTube offers — often 4K, ~800 MB for 20 minutes — so that's roughly a dozen source videos; delete finished ones from the Library to free space, or set `DAILY_CLEANUP_ENABLED=true` in `worker/.env` to wipe everything nightly.

> **Why not Supabase Storage?** Its free plan caps every file at 50 MB. A 20-minute source video is ~800 MB and even one exported clip can exceed the cap. It works on the Pro plan; any other S3-compatible bucket (Backblaze B2, MinIO, AWS S3) works too — see [Alternatives](#alternatives).

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → enable it. Cloudflare asks for a payment method here even for free-tier use; nothing is charged under the free allowance.
2. **Create bucket** → name `clippy` → Create. Leave it private.
3. **Manage R2 API Tokens** → **Create API Token** → permission **Object Read & Write**, scoped to the `clippy` bucket → Create. Copy the values it shows — the secret is shown once:

| Copy this | Into env var |
|---|---|
| **Access Key ID** | `R2_ACCESS_KEY_ID` |
| **Secret Access Key** | `R2_SECRET_ACCESS_KEY` |
| The endpoint shown on the token page, `https://<account-id>.r2.cloudflarestorage.com` | `R2_ENDPOINT` |

`R2_REGION` is `auto`. `R2_BUCKET` is `clippy`. Leave `R2_PUBLIC_DOMAIN` empty (optional: connect a custom domain to the bucket and put it here to serve media without presigned URLs).

**Checkpoint** — after step 7 (the worker's venv is needed):
```bash
cd worker && .venv/bin/python -c "
import config  # loads worker/.env
from storage.r2 import _get_client, BUCKET
_get_client().head_bucket(Bucket=BUCKET); print('storage ok:', BUCKET)"
```
Expect `storage ok: clippy`. `NoSuchBucket` means the bucket name differs; an auth error means the token isn't scoped to this bucket.

---

## 4. OpenRouter

1. [openrouter.ai](https://openrouter.ai) → sign in → **Keys** → **Create key**. Copy it → `OPENROUTER_API_KEY`.
2. Add credit under **Credits** (a few dollars goes a long way).

**Checkpoint**
```bash
curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_API_KEY"
```
Expect a JSON object with `"data"`. An `"error"` means the key is wrong.

The pipeline's default models are Gemini, GPT and Claude via OpenRouter, chosen per stage. Every one can be overridden in `worker/.env` — see the `LLM_MODEL_*` block in `worker/.env.example`.

---

## 5. Replicate

1. [replicate.com](https://replicate.com) → sign in → **Account → API tokens** → create one. Copy it → `REPLICATE_API_TOKEN`.
2. Add a payment method under **Billing**. Transcription runs on a GPU and bills per second — roughly a few cents per hour of video.

**Checkpoint**
```bash
curl -s https://api.replicate.com/v1/account -H "Authorization: Bearer $REPLICATE_API_TOKEN"
```
Expect JSON with your `"username"`.

---

## 6. Env files

Generate the shared secret that lets the web app call the worker:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Create both files from their templates and fill them in with the values collected above:
```bash
cp web/.env.local.example web/.env.local
cp worker/.env.example    worker/.env
```

Every line in the templates is commented. The two files share the Supabase, storage and OpenRouter values; **`WORKER_SECRET` must be identical in both**. Leave `NEXT_PUBLIC_AUTH_MODE=local` as is.

**Checkpoint**
```bash
diff <(grep -E "^(R2_|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY|WORKER_SECRET)" web/.env.local | sort) \
     <(grep -E "^(R2_|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY|WORKER_SECRET)" worker/.env  | sort)
```
Expect **no output** — the shared values match exactly.

---

## 7. Worker

### Option A — native (macOS, Linux)

```bash
cd worker
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt          # several minutes; InsightFace and OpenCV are large
.venv/bin/python -m spacy download en_core_web_sm
.venv/bin/uvicorn main:app --port 8000
```

### Option B — Docker (Windows, or anyone skipping native deps)

From the repo root:
```bash
docker compose up --build
```
The first build takes a while: it installs ffmpeg, Node, a headless Chrome for animated captions, and the Python stack. Subsequent starts are fast.

### What to expect at boot

The worker **refuses to start** if anything is missing and says exactly what:
- `Missing required variables in worker/.env: ...` → fill those in.
- `Required binaries not on PATH: ffmpeg, ffprobe` → install ffmpeg (step 1).

**Checkpoint**
```bash
curl -s http://127.0.0.1:8000/health
```
Expect `{"status":"ok","version":"2.0.0"}`. Now run the storage checkpoint from step 3.

---

## 8. Web

In a second terminal:
```bash
cd web
npm install
npm run dev
```

**Checkpoint**
```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0" http://localhost:3000/library
```
Expect `200`. (The `-A` matters: the app rejects requests without a browser user-agent with `403 Automated access is not allowed`. That is the bot filter, not a setup problem.)

Open **http://localhost:3000** in a browser. You land on the Library with no sign-in.

---

## 9. First clip

1. Click **Add video**, paste a YouTube URL (a 10–20 minute talking-head video is a good first test), submit.
2. Open **Activity** in the sidebar. You'll see `transcribe` run, then `identify_clips`. Transcription of a 15-minute video takes 1–3 minutes on Replicate.
3. Back in **Library**, open the video. Candidate clips appear with hooks and scores.
4. Open a clip → **Export**. Pick 9:16 and a caption style. The first export is slow (face tracking); restyling the same clip afterwards is fast — the tracked cut is cached.

**First-run downloads to expect (once, automatic):**
- InsightFace face model `buffalo_l` (~300 MB) into `~/.insightface/` on the first export.
- HyperFrames plus a headless Chrome (~150 MB) on the first *animated* caption export. If this fails (no Node on the worker's PATH, sandboxing), captions silently fall back to the static renderer — you'll get clean but non-animated text. The Docker image has all of this baked in.

Watch the worker terminal during the first export — it logs each stage.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Worker exits with `Missing required variables` | Fill the listed vars in `worker/.env`. Empty values count as missing. |
| Worker exits with `Required binaries not on PATH` | Install ffmpeg; make sure the terminal that starts the worker can see it (`which ffmpeg`). |
| `S3UploadFailedError` with an empty message on a large file | Your bucket has a per-file cap (Supabase free plan: 50 MB). Use R2 or another bucket without one. |
| `NoSuchBucket` | Bucket name must equal `R2_BUCKET` (`clippy`). |
| `403 Automated access is not allowed` | Bot filter. Use a real browser, or `-A "Mozilla/5.0"` with curl. |
| Video stuck in `transcribe` with a YouTube error | yt-dlp couldn't download. Age/region-restricted sources need `YT_COOKIES_B64` (base64 of a `cookies.txt` export); some networks need `YT_PROXY`. |
| `Worker trigger failed (401)` in the web terminal | `WORKER_SECRET` differs between the two env files. |
| Exports have static captions when an animated style was chosen | HyperFrames render failed and fell back. Check the worker log for the `npx hyperframes` error; usually Node isn't on the worker's PATH or Chrome couldn't download. |
| `psql` migration fails partway | The loop stops at the failing file. Fix the cause, then run only that file and the ones after it — re-running an applied file errors with `already exists`. |
| Thumbnails look like random frames | Normal for videos without a clear frontal face — the picker falls back to the midpoint frame. |

---

## Alternatives

**Another S3-compatible bucket instead of R2.** The client is a plain S3 SDK, so anything with an S3 endpoint works via the same variables. Set `R2_ENDPOINT` to the provider's endpoint, `R2_REGION` to what it expects (`auto` for R2, a real region for most others), and the key pair. **Supabase Storage** (`https://<ref>.storage.supabase.co/storage/v1/s3`, region from Project Settings → Storage) works only on the Pro plan because of the free plan's 50 MB file cap. **Backblaze B2** offers 10 GB free without a card. **MinIO** runs locally if you want storage on your own disk.

**Multi-user auth with Clerk.** For a hosted deployment where several people sign in:
1. Create an app at [dashboard.clerk.com](https://dashboard.clerk.com) and copy the publishable + secret keys.
2. In `web/.env.local`, **delete** the `NEXT_PUBLIC_AUTH_MODE=local` line and uncomment the `CLERK_*` block with your keys.
3. Restart the web app. Sign-up/sign-in pages are live; every user gets their own library.

**Speaker diarization** (who-is-speaking labels in transcripts). Create a free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), accept the terms on the `pyannote/speaker-diarization` model page, and set `HUGGINGFACE_TOKEN` in `worker/.env`.

**Automatic cleanup.** `DAILY_CLEANUP_ENABLED=true` in `worker/.env` wipes all videos, clips and exports at midnight UTC — useful for a shared demo box, dangerous otherwise. Presets and settings are kept.

---

## Updating

```bash
git pull
cd web && npm install
cd ../worker && .venv/bin/pip install -r requirements.txt   # or: docker compose up --build
```
Then apply only the **new** files in `supabase/migrations/` (higher numbers than you've run) with `psql -v ON_ERROR_STOP=1 -f <file>` — re-running an applied file fails with `already exists`.
