"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Collection } from "@/lib/types";
import { Modal } from "@/components/ui/modal";

export function CollectionsEditor({ initialCollections }: { initialCollections: Collection[] }) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editName,    setEditName]    = useState("");
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
    if (res.ok) setCollections((prev) => prev.filter((c) => c.id !== id));
  };

  const deletingCollection = collections.find((c) => c.id === deletingId);

  if (collections.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--yt-text-2)" }}>
        No collections yet. Create them from the Library.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {collections.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "var(--yt-surface)", border: "1px solid var(--yt-border)" }}
          >
            {editingId === c.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")  handleRename(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 px-2 py-1 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--yt-text-2)]"
                  style={{ background: "var(--yt-surface-2)", border: "1px solid var(--yt-border)", color: "var(--yt-text)" }}
                />
                <button aria-label="Save name" onClick={() => handleRename(c.id)} className="p-1.5 text-green-400 hover:text-green-300 transition-colors">
                  <Check className="w-4 h-4" />
                </button>
                <button aria-label="Cancel rename" onClick={() => setEditingId(null)} className="p-1.5 transition-colors" style={{ color: "var(--yt-text-2)" }}>
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium" style={{ color: "var(--yt-text)" }}>{c.name}</span>
                <button
                  onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                  className="p-1.5 transition-colors hover:text-[var(--yt-text)]"
                  style={{ color: "var(--yt-text-2)" }}
                  title="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeletingId(c.id)}
                  className="p-1.5 transition-colors hover:text-red-400"
                  style={{ color: "var(--yt-text-2)" }}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {deletingCollection && (
        <Modal onClose={() => setDeletingId(null)} label="Delete collection?"
          className="w-80 rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
          style={{ background: "var(--yt-surface)", border: "1px solid var(--yt-border)" }}>
            <h3 className="text-base font-semibold" style={{ color: "var(--yt-text)" }}>
              Delete collection?
            </h3>
            <p className="text-sm" style={{ color: "var(--yt-text-2)" }}>
              <span className="font-medium" style={{ color: "var(--yt-text)" }}>{deletingCollection.name}</span> will be deleted.
              Videos inside will be unassigned but not deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: "var(--yt-text-2)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId!)}
                className="px-4 py-2 text-sm font-medium rounded-full text-white"
                style={{ background: "#dc2626" }}
              >
                Delete
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}
