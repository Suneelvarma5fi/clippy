"use client";

import { useState } from "react";
import { Loader2, Save, CheckCircle } from "lucide-react";
import { NicheProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Props {
  initialProfile: (NicheProfile & { user_id?: string }) | null;
}

// Server enforces the same limits (api/account/niche-profile)
const LIMITS = { niche: 120, audience: 200 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function NicheProfileEditor({ initialProfile }: Props) {
  const [niche, setNiche]         = useState(initialProfile?.niche ?? "");
  const [audience, setAudience]   = useState(initialProfile?.audience ?? "");
  const [minDur, setMinDur]       = useState(initialProfile?.clip_duration_min ?? 10);
  const [maxDur, setMaxDur]       = useState(initialProfile?.clip_duration_max ?? 120);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  const handleSave = async () => {
    const min = clamp(minDur || 10, 10, 120);
    const max = clamp(maxDur || 120, min, 120);
    setMinDur(min);
    setMaxDur(max);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/account/niche-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche:             niche.slice(0, LIMITS.niche),
          audience:          audience.slice(0, LIMITS.audience),
          clip_duration_min: min,
          clip_duration_max: max,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-xs mb-1.5";
  const labelStyle = { color: "var(--yt-text-2)" };
  const boxCls = "w-full px-3 py-2 rounded-lg text-sm resize-none text-[var(--yt-text)] placeholder-[var(--yt-text-2)] focus:outline-none focus:ring-1 focus:ring-[var(--yt-border)]";
  const boxStyle = { background: "var(--yt-surface-2)", border: "1px solid var(--yt-border)" };
  const numCls = "w-20 px-3 py-2 rounded-lg text-sm text-center text-[var(--yt-text)] focus:outline-none focus:ring-1 focus:ring-[var(--yt-border)]";

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} style={labelStyle}>Niche / topic</label>
        <textarea
          rows={2}
          maxLength={LIMITS.niche}
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="e.g. tech entrepreneurship, fitness, finance"
          className={boxCls}
          style={boxStyle}
        />
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>Target audience</label>
        <textarea
          rows={2}
          maxLength={LIMITS.audience}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g. founders, indie hackers, gym beginners"
          className={boxCls}
          style={boxStyle}
        />
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>Clip length (seconds)</label>
        <div className="flex items-center gap-3">
          <input
            type="number" min={10} max={120}
            value={minDur}
            onChange={(e) => setMinDur(Number(e.target.value))}
            onBlur={() => setMinDur((v) => clamp(v || 10, 10, 120))}
            className={numCls}
            style={boxStyle}
          />
          <span className="text-xs" style={labelStyle}>to</span>
          <input
            type="number" min={10} max={120}
            value={maxDur}
            onChange={(e) => setMaxDur(Number(e.target.value))}
            onBlur={() => setMaxDur((v) => clamp(v || 120, minDur, 120))}
            className={numCls}
            style={boxStyle}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button variant="red" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save preferences
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}
