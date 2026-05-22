"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface DbCard {
  id: string;
  name: string;
  kit: string | null;
  rarity: string;
  imageUrl: string;
  backImageUrl: string | null;
  attribute: string | null;
  description: string | null;
  stats: Record<string, number>;
}

const RARITY_COLORS: Record<string, string> = {
  common: "text-zinc-400 border-zinc-700",
  rare: "text-blue-400 border-blue-800",
  epic: "text-purple-400 border-purple-800",
  legendary: "text-amber-400 border-amber-800",
};

const BLANK_CARD = { name: "", kit: "", rarity: "common", imageUrl: "", backImageUrl: "", attribute: "", description: "", pace: "70", power: "70", skill: "70" };

export default function AdminCardsPage() {
  const params = useParams<{ channelId: string }>();
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("adminSecret") ?? "" : ""
  );
  const [cards, setCards] = useState<DbCard[]>([]);
  const [channelName, setChannelName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editCard, setEditCard] = useState<DbCard | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK_CARD);
  const [saving, setSaving] = useState(false);
  const [filterRarity, setFilterRarity] = useState("all");

  const load = useCallback(async (s: string) => {
    if (!s) return;
    setLoading(true);
    setError(null);
    const [cardsRes, chRes] = await Promise.all([
      fetch(`/api/admin/channels/${params.channelId}/cards`, { headers: { "x-admin-secret": s } }),
      fetch(`/api/admin/channels`, { headers: { "x-admin-secret": s } }),
    ]);
    setLoading(false);
    if (!cardsRes.ok) { setError("Invalid secret or server error."); return; }
    setCards((await cardsRes.json()).cards ?? []);
    if (chRes.ok) {
      const data = await chRes.json();
      const ch = data.channels?.find((c: { id: string; name: string }) => c.id === params.channelId);
      if (ch) setChannelName(ch.name);
    }
    sessionStorage.setItem("adminSecret", s);
  }, [params.channelId]);

  useEffect(() => {
    if (secret) load(secret);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(card: DbCard) {
    setEditCard(card);
    setForm({
      name: card.name,
      kit: card.kit ?? "",
      rarity: card.rarity,
      imageUrl: card.imageUrl,
      backImageUrl: card.backImageUrl ?? "",
      attribute: card.attribute ?? "",
      description: card.description ?? "",
      pace: String(card.stats?.pace ?? 70),
      power: String(card.stats?.power ?? 70),
      skill: String(card.stats?.skill ?? 70),
    });
    setShowAdd(false);
  }

  function openAdd() {
    setEditCard(null);
    setForm(BLANK_CARD);
    setShowAdd(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      kit: form.kit || null,
      rarity: form.rarity,
      imageUrl: form.imageUrl,
      backImageUrl: form.backImageUrl || null,
      attribute: form.attribute || null,
      description: form.description || null,
      stats: { pace: Number(form.pace), power: Number(form.power), skill: Number(form.skill) },
    };

    let res: Response;
    if (editCard) {
      res = await fetch(`/api/admin/channels/${params.channelId}/cards/${editCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`/api/admin/channels/${params.channelId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(payload),
      });
    }

    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError((data.error as string) ?? "Failed to save card"); return; }
    setEditCard(null);
    setShowAdd(false);
    await load(secret);
  }

  async function handleDelete(cardId: string, cardName: string) {
    if (!confirm(`Delete card "${cardName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/channels/${params.channelId}/cards/${cardId}`, {
      method: "DELETE",
      headers: { "x-admin-secret": secret },
    });
    if (res.ok) await load(secret);
    else setError("Failed to delete card");
  }

  const displayed = filterRarity === "all" ? cards : cards.filter((c) => c.rarity === filterRarity);

  const FormPanel = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4 my-4">
        <h2 className="text-white font-bold text-lg">{editCard ? "Edit Card" : "New Card"}</h2>
        {error && <p className="text-red-300 text-sm bg-red-900/30 rounded-lg p-3">{error}</p>}
        {[
          { key: "name", label: "Name", required: true },
          { key: "kit", label: "Kit" },
          { key: "imageUrl", label: "Image URL", required: true },
          { key: "backImageUrl", label: "Back Image URL" },
          { key: "attribute", label: "Attribute" },
          { key: "description", label: "Description" },
        ].map(({ key, label, required }) => (
          <div key={key}>
            <label className="text-zinc-400 text-xs mb-1 block">{label}</label>
            <input
              type="text"
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              required={required}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
            />
          </div>
        ))}
        <div>
          <label className="text-zinc-400 text-xs mb-1 block">Rarity</label>
          <select
            value={form.rarity}
            onChange={(e) => setForm((f) => ({ ...f, rarity: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
          >
            {["common", "rare", "epic", "legendary"].map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["pace", "power", "skill"].map((stat) => (
            <div key={stat}>
              <label className="text-zinc-400 text-xs mb-1 block capitalize">{stat}</label>
              <input
                type="number"
                min={1}
                max={99}
                value={form[stat as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [stat]: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 text-center"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => { setEditCard(null); setShowAdd(false); setError(null); }} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? "Saving..." : editCard ? "Save Changes" : "Create Card"}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/admin/channels/${params.channelId}`} className="text-zinc-500 text-sm hover:text-white transition-colors">← {channelName || "Channel"}</Link>
            <h1 className="text-white text-2xl font-bold mt-1">Cards {channelName ? `— ${channelName}` : ""}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{cards.length} total</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
          >
            + Add Card
          </button>
        </div>

        {!cards.length && !loading && (
          <div className="flex gap-3">
            <input
              type="password"
              placeholder="Admin secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onBlur={() => load(secret)}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
            />
            <button onClick={() => load(secret)} className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm transition-all">Load</button>
          </div>
        )}

        {error && !editCard && !showAdd && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>}

        <div className="flex gap-2">
          {["all", "common", "rare", "epic", "legendary"].map((r) => (
            <button
              key={r}
              onClick={() => setFilterRarity(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize
                ${filterRarity === r ? "bg-purple-900/60 border-purple-600 text-white" : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"}`}
            >
              {r}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {displayed.map((card) => (
            <div key={card.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 space-y-2">
              {card.imageUrl && (
                <img src={card.imageUrl} alt={card.name} className="w-full aspect-[3/4] object-cover rounded-lg" />
              )}
              <div>
                <p className="text-white font-semibold text-sm truncate">{card.name}</p>
                <p className="text-zinc-500 text-xs truncate">{card.kit}</p>
                <span className={`text-[10px] font-medium border rounded px-1 py-0.5 mt-1 inline-block capitalize ${RARITY_COLORS[card.rarity] ?? "text-zinc-400 border-zinc-700"}`}>
                  {card.rarity}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(card)}
                  className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(card.id, card.name)}
                  className="py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-red-400 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {(editCard || showAdd) && FormPanel}
      </div>
    </main>
  );
}
