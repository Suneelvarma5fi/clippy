"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Video, Collection } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { AddVideoDialog } from "@/components/library/add-video-dialog";
import { VideoCard } from "@/components/library/video-card";
import { useSearch } from "@/lib/search-context";
import { Plus, Pencil, Trash2 } from "lucide-react";

// ── Collection chips ──────────────────────────────────────────────────────────

function CollectionChips({
  collections,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  collections: Collection[];
  selected:    string | null;
  onSelect:    (id: string | null) => void;
  onCreate:    (name: string) => Promise<string | null>;
  onRename:    (id: string, name: string) => Promise<string | null>;
  onDelete:    (id: string) => Promise<void>;
}) {
  const [showNew,  setShowNew]  = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newError, setNewError] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  // Right-click (desktop) / long-press (touch) opens a menu (rename / delete) anchored at the pointer.
  const [menu, setMenu] = useState<{ id: string; name: string; x: number; y: number; mode: "menu" | "delete" } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline rename — the chip becomes a text input.
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editName,  setEditName]  = useState("");
  const [editError, setEditError] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const skipCommit   = useRef(false);

  const openMenu = (c: Collection, x: number, y: number) =>
    setMenu({ id: c.id, name: c.name, x: Math.min(x, window.innerWidth - 232), y, mode: "menu" });

  const startLongPress = (c: Collection, x: number, y: number) => {
    longPress.current = setTimeout(() => openMenu(c, x, y), 500);
  };
  const cancelLongPress = () => {
    if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
  };

  const startRename = (id: string, name: string) => {
    setMenu(null);
    setEditId(id);
    setEditName(name);
    setEditError("");
  };
  const cancelRename = () => { skipCommit.current = true; setEditId(null); setEditName(""); setEditError(""); };
  const commitRename = async () => {
    if (skipCommit.current) { skipCommit.current = false; return; }
    if (!editId) return;
    const name = editName.trim();
    const orig = collections.find((c) => c.id === editId)?.name;
    if (!name || name === orig) { cancelRename(); skipCommit.current = false; return; }
    const err = await onRename(editId, name);
    if (err) { setEditError(err); editInputRef.current?.focus(); return; }
    setEditId(null); setEditName(""); setEditError("");
  };

  useEffect(() => { if (showNew) newInputRef.current?.focus(); }, [showNew]);
  useEffect(() => { if (editId) { skipCommit.current = false; editInputRef.current?.focus(); editInputRef.current?.select(); } }, [editId]);

  const commitNew = async () => {
    if (!newName.trim()) { setShowNew(false); setNewName(""); return; }
    const err = await onCreate(newName.trim());
    if (err) { setNewError(err); newInputRef.current?.focus(); return; }
    setShowNew(false);
    setNewName("");
    setNewError("");
  };

  const baseChip = "flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer select-none";
  const activeChip = `${baseChip} bg-[var(--yt-text)] text-[var(--yt-bg)]`;
  const inactiveChip = `${baseChip} bg-[var(--yt-surface)] text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)]`;

  return (
    <>
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center">
      <button onClick={() => onSelect(null)} className={selected === null ? activeChip : inactiveChip}>
        All
      </button>

      {collections.map((c) => (
        editId === c.id ? (
          <input
            key={c.id}
            ref={editInputRef}
            value={editName}
            onChange={(e) => { setEditName(e.target.value); setEditError(""); }}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
            }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium box-border focus:outline-none focus:ring-2 focus:ring-inset ${editError ? "ring-2 ring-inset ring-red-500" : "focus:ring-[var(--yt-text-2)]"}`}
            style={{ background: "var(--yt-surface-2)", color: "var(--yt-text)", minWidth: "8rem" }}
          />
        ) : (
          <button
            key={c.id}
            onClick={() => onSelect(selected === c.id ? null : c.id)}
            onContextMenu={(e) => { e.preventDefault(); openMenu(c, e.clientX, e.clientY); }}
            onTouchStart={(e) => startLongPress(c, e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            title="Right-click to rename or delete"
            className={selected === c.id ? activeChip : inactiveChip}
          >
            {c.name}
          </button>
        )
      ))}

      {showNew ? (
        <div className="flex-shrink-0 flex flex-col gap-1">
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNewError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter")  { e.preventDefault(); commitNew(); }
              if (e.key === "Escape") { setShowNew(false); setNewName(""); setNewError(""); }
            }}
            placeholder="Collection name…"
            className={`px-3 py-1.5 rounded-full text-sm focus:outline-none focus:ring-2 ${newError ? "ring-2 ring-red-500" : "focus:ring-[var(--yt-text-2)]"}`}
            style={{ background: "var(--yt-surface-2)", color: "var(--yt-text)", minWidth: "10rem" }}
          />
          {newError && <p className="text-[10px] text-red-400 px-3">{newError}</p>}
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-[var(--yt-text-2)] hover:bg-[var(--yt-surface-2)] transition-colors border border-dashed"
          style={{ borderColor: "var(--yt-border)" }}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      )}
    </div>

    {/* Collection context menu — anchored at the pointer */}
    {menu && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
        {menu.mode === "menu" ? (
          <div
            className="fixed z-50 w-44 rounded-xl py-1 shadow-2xl"
            style={{ top: menu.y, left: menu.x, background: "var(--yt-surface)", border: "1px solid var(--yt-border)" }}
          >
            <button
              onClick={() => startRename(menu.id, menu.name)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)] transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={() => setMenu({ ...menu, mode: "delete" })}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--yt-surface-2)] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        ) : (
          <div
            className="fixed z-50 w-56 rounded-xl p-3 shadow-2xl flex flex-col gap-2"
            style={{ top: menu.y, left: menu.x, background: "var(--yt-surface)", border: "1px solid var(--yt-border)" }}
          >
            <p className="text-sm text-[var(--yt-text)]">
              Delete <span className="font-medium">{menu.name}</span>?
            </p>
            <p className="text-xs text-[var(--yt-text-2)]">Videos stay in your library, just uncategorised.</p>
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={() => setMenu(null)}
                className="px-3 py-1.5 text-sm rounded-full text-[var(--yt-text-2)] hover:bg-[var(--yt-surface-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(menu.id); setMenu(null); }}
                className="px-3 py-1.5 text-sm font-medium rounded-full text-white"
                style={{ background: "#dc2626" }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </>
    )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [videos,      setVideos]      = useState<Video[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collFilter,  setCollFilter]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const { query: search }             = useSearch();

  const fetchVideos = async () => {
    const res = await fetch("/api/videos");
    if (res.ok) setVideos((await res.json()) ?? []);
    setLoading(false);
  };

  const fetchCollections = async () => {
    const res = await fetch("/api/collections");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setCollections(data);
  };

  useEffect(() => {
    fetchVideos();
    fetchCollections();
    const onAdded = () => { fetchVideos(); fetchCollections(); };
    window.addEventListener("clippy:video-added", onAdded);
    return () => window.removeEventListener("clippy:video-added", onAdded);
  }, []);

  // Only poll while something is actually processing (and the tab is visible).
  const anyProcessing = videos.some(
    (v) => v.status === "pending" || v.status === "transcribing" || v.status === "identifying",
  );
  usePolling(fetchVideos, 5000, anyProcessing);

  const handleCreate = async (name: string): Promise<string | null> => {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setCollections((prev) => [...prev, data]);
      return null;
    }
    return data.error ?? "Failed to create collection";
  };

  const handleRenameCollection = async (id: string, name: string): Promise<string | null> => {
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setCollections((prev) => prev.map((c) => c.id === id ? data : c));
      return null;
    }
    return data.error ?? "Failed to rename collection";
  };

  const handleDeleteCollection = async (id: string) => {
    const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setCollFilter((cur) => (cur === id ? null : cur));
    // Videos that lived in this collection are now uncategorised (DB sets null).
    setVideos((prev) => prev.map((v) => v.collection_id === id ? { ...v, collection_id: null } : v));
  };

  const handleMove = async (videoId: string, collectionId: string | null) => {
    const res = await fetch(`/api/videos/${videoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_id: collectionId }),
    });
    if (res.ok) {
      setVideos((prev) => prev.map((v) => v.id === videoId ? { ...v, collection_id: collectionId } : v));
    }
  };

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (collFilter !== null && v.collection_id !== collFilter) return false;
      return true;
    });
  }, [videos, search, collFilter]);

  return (
    <div className="flex flex-col h-full">

      {/* ── Collection chips — sticky ── */}
      <header className="sticky top-0 z-10 px-8 pt-4 pb-3" style={{ background: "var(--yt-bg)" }}>
        <CollectionChips
          collections={collections}
          selected={collFilter}
          onSelect={setCollFilter}
          onCreate={handleCreate}
          onRename={handleRenameCollection}
          onDelete={handleDeleteCollection}
        />
      </header>

      {/* ── Grid ── */}
      <div className="flex-1 px-8 py-4">
        <p className="text-xs text-[var(--yt-text-2)] mb-5">
          {filtered.length} of {videos.length} video{videos.length !== 1 ? "s" : ""}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="aspect-video rounded-xl bg-[var(--yt-surface)] animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-[var(--yt-surface)] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[var(--yt-surface)] animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-[var(--yt-text-2)]">
            <p className="text-lg mb-2">No videos found</p>
            {search || collFilter ? (
              <p className="text-sm">Try a different filter.</p>
            ) : (
              <>
                <p className="text-sm mb-5">Paste a YouTube link to get started.</p>
                <AddVideoDialog onAdded={() => window.dispatchEvent(new Event("clippy:video-added"))} />
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {filtered.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                collections={collections}
                onDeleted={fetchVideos}
                onMoved={handleMove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
