import { createAdminClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";
import { AccountTabs } from "@/components/account/account-tabs";

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const db = createAdminClient();
  const [
    { data: collections },
    { data: profile },
    { count: videoCount },
    { count: clipCount },
    { count: exportCount },
  ] = await Promise.all([
    db.from("collections").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    db.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("videos").select("*", { count: "exact", head: true }).eq("user_id", userId),
    db.from("clips").select("*", { count: "exact", head: true }).eq("user_id", userId),
    db.from("exports").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "done"),
  ]);

  const stats = [
    { label: "Videos",        value: videoCount  ?? 0 },
    { label: "Clips",         value: clipCount   ?? 0 },
    { label: "Exports done",  value: exportCount ?? 0 },
  ];

  return (
    <div className="flex flex-col h-full">

      <header
        className="sticky top-0 z-10 px-8 pt-5 pb-4 flex-shrink-0"
        style={{ background: "var(--yt-bg)", borderBottom: "1px solid var(--yt-border)" }}
      >
        <h1 className="text-xl font-bold text-[var(--yt-text)]">Account</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--yt-text-2)" }}>
          Manage your account and collections
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl space-y-8">

        {/* Stats */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--yt-text-2)" }}>
            Overview
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {stats.map(s => (
              <div
                key={s.label}
                className="rounded-xl px-4 py-4"
                style={{ background: "var(--yt-surface)", border: "1px solid var(--yt-border)" }}
              >
                <p className="text-2xl font-bold" style={{ color: "var(--yt-text)" }}>{s.value.toLocaleString()}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--yt-text-2)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Preferences + Collections */}
        <AccountTabs collections={collections ?? []} profile={profile ?? null} />

      </div>
    </div>
  );
}
