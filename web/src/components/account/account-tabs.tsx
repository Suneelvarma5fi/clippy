"use client";

import { useState } from "react";
import { Collection, NicheProfile } from "@/lib/types";
import { CollectionsEditor } from "./collections-editor";
import { NicheProfileEditor } from "./niche-profile-editor";

const TABS = ["Preferences", "Collections"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  collections: Collection[];
  profile: (NicheProfile & { user_id?: string }) | null;
}

export function AccountTabs({ collections, profile }: Props) {
  const [tab, setTab] = useState<Tab>("Preferences");

  return (
    <div>
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--yt-border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-medium transition-colors -mb-px"
            style={
              tab === t
                ? { color: "var(--yt-text)", borderBottom: "2px solid var(--yt-red)" }
                : { color: "var(--yt-text-2)", borderBottom: "2px solid transparent" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Preferences" && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--yt-text-2)" }}>
            Clip Preferences
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--yt-text-2)" }}>
            Tune how clips are found — duration range, niche, and audience.
            Saved preferences apply to every new clip identification run.
          </p>
          <NicheProfileEditor initialProfile={profile} />
        </section>
      )}

      {tab === "Collections" && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--yt-text-2)" }}>
            Collections
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--yt-text-2)" }}>
            Rename or delete your video collections. Create new ones from the Library.
          </p>
          <CollectionsEditor initialCollections={collections} />
        </section>
      )}
    </div>
  );
}
