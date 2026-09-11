"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { UserButton } from "@clerk/nextjs";
import { Library, Settings, Menu, Search, X, Activity } from "lucide-react";
import { AddVideoDialog } from "@/components/library/add-video-dialog";
import { SearchProvider, useSearch } from "@/lib/search-context";
import { LOCAL_AUTH } from "@/lib/auth-mode";

const NAV = [
  { href: "/library",   icon: Library,    label: "Library" },
  { href: "/jobs",      icon: Activity,   label: "Activity" },
  { href: "/account",   icon: Settings,   label: "Account" },
];

// Inner component so it can use SearchProvider's context
function Shell({ children }: { children: React.ReactNode }) {
  const pathname        = usePathname();
  const router          = useRouter();
  const [open, setOpen] = useState(false);
  const { query, setQuery } = useSearch();
  const searchRef = useRef<HTMLInputElement>(null);

  // Typing narrows the library; from anywhere else, the first keystroke takes
  // the user there so the field is never dead chrome.
  const onSearchChange = (value: string) => {
    setQuery(value);
    if (value && pathname !== "/library") router.push("/library");
  };

  // "/" focuses search (YouTube-standard); Esc clears + blurs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Restore the saved preference, or default by viewport width on first mount
  // (YouTube: expanded on desktop, collapsed rail on narrow screens).
  useEffect(() => {
    const saved = localStorage.getItem("clippy:sidebar-open");
    setOpen(saved !== null ? saved === "1" : window.innerWidth >= 1024);
  }, []);

  const toggleSidebar = () =>
    setOpen((o) => {
      const next = !o;
      localStorage.setItem("clippy:sidebar-open", next ? "1" : "0");
      return next;
    });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--yt-bg)" }}>

      {/* ── Top bar — always visible ── */}
      <header
        className="flex-shrink-0 flex items-center gap-4 px-4 z-50"
        style={{
          height: 56,
          background: "var(--yt-bg)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--yt-surface-2)] transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5 text-[var(--yt-text)]" />
          </button>

          <Link href="/library" className="flex items-center gap-2 select-none">
            <Image
              src="/logo.png"
              alt="Clippy"
              width={559}
              height={377}
              className="object-contain"
              style={{ height: "28px", width: "auto" }}
            />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--yt-text)" }}>
              clippy
            </span>
          </Link>
        </div>

        {/* Center: search — flexes & shrinks so it never overlaps the right cluster */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="relative w-full max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--yt-text-2)] pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search videos…"
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
              className="w-full h-9 pl-11 pr-9 rounded-full text-sm text-[var(--yt-text)] placeholder-[var(--yt-text-2)] focus:outline-none focus:ring-2 focus:ring-[var(--yt-text-2)]"
              style={{ background: "var(--yt-surface)", border: "1px solid rgba(255,255,255,0.06)" }}
            />
            {query && (
              <button aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--yt-text-2)] hover:text-[var(--yt-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Add Video + User */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <AddVideoDialog onAdded={() => window.dispatchEvent(new Event("clippy:video-added"))} />
          {!LOCAL_AUTH && <UserButton />}
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar — nav + user only */}
        <aside
          className="flex-shrink-0 flex flex-col overflow-hidden transition-all duration-200"
          style={{ width: open ? 240 : 72, background: "var(--yt-bg)" }}
        >
          <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  title={!open ? label : undefined}
                  className={`flex items-center gap-4 rounded-xl transition-colors px-3 py-2.5 overflow-hidden ${
                    active
                      ? "bg-[var(--yt-surface-2)] text-[var(--yt-text)] font-medium"
                      : "text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)]"
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span
                    className={`text-sm whitespace-nowrap transition-opacity duration-200 ${
                      open ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              );
            })}
          </nav>

        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function ShellClient({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
      <Shell>{children}</Shell>
    </SearchProvider>
  );
}
