"""
Shared OpenRouter client for the clip pipeline agents.
Each agent has a primary model and a fallback — the fallback is tried
automatically when the primary fails. All agents return strict JSON.
"""

from __future__ import annotations
import json
import logging
import os
import re
from typing import Any

import httpx

log = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# Per-agent model routing (spec §9) — env-overridable, OpenRouter slugs
# Budget shape: cheap model for the high-fanout scout, mid model for per-clip
# crafting, strongest model for the single comparative-ranking call.
AGENT_MODELS: dict[str, tuple[str, str]] = {
    "scout": (
        os.getenv("LLM_MODEL_SCOUT",       "google/gemini-3.1-flash-lite"),
        os.getenv("LLM_MODEL_SCOUT_FB",    "openai/gpt-5.4-mini"),
    ),
    "crafter": (
        os.getenv("LLM_MODEL_CRAFTER",     "openai/gpt-5.4"),
        os.getenv("LLM_MODEL_CRAFTER_FB",  "anthropic/claude-sonnet-4-6"),
    ),
    "ranker": (
        os.getenv("LLM_MODEL_RANKER",      "openai/gpt-5.5"),
        os.getenv("LLM_MODEL_RANKER_FB",   "anthropic/claude-opus-4-7"),
    ),
    "reader": (
        os.getenv("LLM_MODEL_READER",      "google/gemini-3.1-flash-lite"),
        os.getenv("LLM_MODEL_READER_FB",   "openai/gpt-5.4-mini"),
    ),
    "tension": (
        os.getenv("LLM_MODEL_TENSION",     "openai/gpt-5.5"),
        os.getenv("LLM_MODEL_TENSION_FB",  "anthropic/claude-opus-4-6"),
    ),
    "knowledge_gap": (
        os.getenv("LLM_MODEL_KG",          "openai/gpt-5.4"),
        os.getenv("LLM_MODEL_KG_FB",       "anthropic/claude-sonnet-4-6"),
    ),
    "evaluator": (
        os.getenv("LLM_MODEL_EVAL",        "openai/gpt-5.4-mini"),
        os.getenv("LLM_MODEL_EVAL_FB",     "anthropic/claude-haiku-4-5-20251001"),
    ),
    "hook_writer": (
        os.getenv("LLM_MODEL_HOOK",        "openai/gpt-5.5"),
        os.getenv("LLM_MODEL_HOOK_FB",     "anthropic/claude-opus-4-7"),
    ),
}


def parse_json_response(raw: str) -> Any:
    """Parse LLM output as JSON, stripping markdown fences if present."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    return json.loads(raw)


async def _call_model(
    model: str,
    system: str,
    user: str,
    api_key: str,
    temperature: float,
    max_tokens: int,
) -> str:
    body: dict = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{OPENROUTER_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "X-Title": "Clippy",
            },
            json=body,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def call_agent(
    agent: str,
    system: str,
    user: str,
    api_key: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> Any:
    """
    Call an agent's primary model; on any failure (HTTP, JSON), retry once
    on the primary, then try the fallback model. Returns parsed JSON.
    """
    primary, fallback = AGENT_MODELS[agent]
    last_error: Exception | None = None
    for model in (primary, primary, fallback):
        try:
            raw = await _call_model(model, system, user, api_key, temperature, max_tokens)
            return parse_json_response(raw)
        except Exception as e:
            last_error = e
            log.warning("Agent %s call failed on %s: %s", agent, model, e)
    raise RuntimeError(f"Agent {agent} failed on primary and fallback: {last_error}")
