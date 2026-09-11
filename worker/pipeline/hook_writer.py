"""
Agent 5 — Hook Writer
Write one punchy hook line per approved clip. No captions, no metadata — one
line only. Runs in parallel after cut points are final, capped at 5.
"""

from __future__ import annotations
import asyncio
import logging
from typing import Any

from .openrouter import call_agent

log = logging.getLogger(__name__)

MAX_PARALLEL = 5

SYSTEM_PROMPT = """\
You write one hook line for a short-form clip (Reels, TikTok, Shorts). The hook is \
the single line shown over or above the clip — it decides whether a scrolling \
stranger stops.

Rules:
- One line. Under 12 words. No hashtags, no emojis, no quotation marks.
- Lead with the tension: the contradiction, the reversal, or the thing they don't \
know they don't know.
- Specific beats clever. A number, a named belief, or a concrete stake beats a vague tease.
- Never summarise the clip — open the gap the clip closes.
- No clickbait that the clip doesn't pay off.
{style_hint}
Output strict JSON only:
{{"hook_line": "<the line>"}}\
"""


async def _write_one(clip: dict, api_key: str, sem: asyncio.Semaphore, style_hint: str) -> str:
    user = (
        f"Moment ({clip.get('archetype')}): {clip.get('why', '')} — {clip.get('reasoning', '')}\n\n"
        f"Clip transcript:\n{clip['text']}"
    )
    async with sem:
        data = await call_agent(
            "hook_writer", SYSTEM_PROMPT.format(style_hint=style_hint), user,
            api_key=api_key, temperature=0.7, max_tokens=256,
        )
    hook = (data.get("hook_line") or "").strip()
    if not hook:
        raise ValueError("empty hook line")
    return hook


async def write_hooks(
    clips: list[dict[str, Any]],
    api_key: str,
    hook_style: str = "",
) -> list[dict[str, Any]]:
    """Adds hook_line to each clip. Falls back to the clip's first sentence on failure."""
    style_hint = f"- Preferred style: {hook_style}\n" if hook_style else ""
    sem = asyncio.Semaphore(MAX_PARALLEL)
    results = await asyncio.gather(
        *(_write_one(c, api_key, sem, style_hint) for c in clips),
        return_exceptions=True,
    )

    out: list[dict[str, Any]] = []
    for clip, result in zip(clips, results):
        if isinstance(result, Exception):
            log.warning("Hook writing failed for clip rank %s: %s", clip.get("rank"), result)
            fallback = clip["text"].split(". ")[0][:90]
            out.append({**clip, "hook_line": fallback})
        else:
            out.append({**clip, "hook_line": result})
    return out
