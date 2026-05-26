"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  slug: string;
  name: string;
  youtubeChannelId: string;
  description: string | null;
  thumbnailUrl: string | null;
  rewardTags: string | null;
  isActive: boolean;
}

interface DbCard {
  id: string;
  name: string;
  kit: string | null;
  rarity: string;
  imageUrl: string;
  backImageUrl: string | null;
  attribute: string | null;
  description: string | null;
  availableInPacks: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_OPTIONS = ["common", "rare", "epic", "legendary"] as const;

const RARITY_STYLES: Record<string, string> = {
  common:    "text-zinc-300 bg-zinc-700/60 border-zinc-600",
  rare:      "text-blue-300 bg-blue-900/40 border-blue-700",
  epic:      "text-purple-300 bg-purple-900/40 border-purple-700",
  legendary: "text-amber-300 bg-amber-900/40 border-amber-700",
};

const BLANK_CARD = {
  name: "", kit: "", rarity: "common", imageUrl: "",
  backImageUrl: "", attribute: "Skill", description: "", availableInPacks: true,
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminChannelPage() {
  const params = useParams<{ channelId: string }>();
  const router = useRouter();

  const [secret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("adminSecret") ?? "" : ""
  );
  const [tab, setTab] = useState<"settings" | "cards">("settings");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [cards, setCards] = useState<DbCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings form
  const [form, setForm] = useState({
    slug: "", name: "", youtubeChannelId: "", description: "",
    thumbnailUrl: "", rewardTags: "", isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Cards
  const [filterRarity, setFilterRarity] = useState("all");
  const [cardModal, setCardModal] = useState<null | "add" | DbCard>(null);
  const [cardForm, setCardForm] = useState(BLANK_CARD);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  // Track cards being saved inline to show spinner on them
  const [patchingCard, setPatchingCard] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!secret) { setLoading(false); return; }
    setLoading(true);
    const [chRes, cardsRes] = await Promise.all([
      fetch("/api/admin/channels", { headers: { "x-admin-secret": secret } }),
      fetch(`/api/admin/channels/${params.channelId}/cards`, { headers: { "x-admin-secret": secret } }),
    ]);
    setLoading(false);
    if (!chRes.ok) { setError("Invalid admin secret."); return; }
    const chData = await chRes.json();
    const ch: Channel | undefined = chData.channels?.find((c: Channel) => c.id === params.channelId);
    if (!ch) { setError("Channel not found."); return; }
    setChannel(ch);
    setForm({
      slug: ch.slug, name: ch.name, youtubeChannelId: ch.youtubeChannelId,
      description: ch.description ?? "", thumbnailUrl: ch.thumbnailUrl ?? "",
      rewardTags: ch.rewardTags ?? "", isActive: ch.isActive,
    });
    if (cardsRes.ok) setCards((await cardsRes.json()).cards ?? []);
  }, [secret, params.channelId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings handlers ────────────────────────────────────────────────────────

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveMsg(null); setError(null);
    const res = await fetch(`/api/admin/channels/${params.channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(null), 3000);
    } else {
      const d = await res.json().catch(() => ({}));
      setError((d.error as string) ?? "Failed to save.");
    }
  }

  async function handleDeactivate() {
    if (!confirm(`Deactivate "${channel?.name}"? It will be hidden from the home page.`)) return;
    await fetch(`/api/admin/channels/${params.channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ isActive: false }),
    });
    router.push("/admin/channels");
  }

  // ── Inline card patch (rarity / availability) ─────────────────────────────

  async function patchCard(cardId: string, data: Partial<DbCard>) {
    setPatchingCard(cardId);
    await fetch(`/api/admin/channels/${params.channelId}/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(data),
    });
    setPatchingCard(null);
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, ...data } : c));
  }

  // ── Card modal handlers ───────────────────────────────────────────────────

  function openAddModal() {
    setCardForm({ ...BLANK_CARD });
    setCardError(null);
    setCardModal("add");
  }

  function openEditModal(card: DbCard) {
    setCardForm({
      name: card.name, kit: card.kit ?? "", rarity: card.rarity,
      imageUrl: card.imageUrl, backImageUrl: card.backImageUrl ?? "",
      attribute: card.attribute ?? "Skill", description: card.description ?? "",
      availableInPacks: card.availableInPacks,
    });
    setCardError(null);
    setCardModal(card);
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault();
    setCardSaving(true); setCardError(null);
    const payload = {
      ...cardForm,
      kit: cardForm.kit || null,
      backImageUrl: cardForm.backImageUrl || null,
      description: cardForm.description || null,
    };
    const isEdit = cardModal !== "add";
    const url = isEdit
      ? `/api/admin/channels/${params.channelId}/cards/${(cardModal as DbCard).id}`
      : `/api/admin/channels/${params.channelId}/cards`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(payload),
    });
    setCardSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setCardError(d.error ?? "Failed."); return; }
    setCardModal(null);
    await load();
  }

  async function handleDeleteCard(card: DbCard) {
    if (!confirm(`Delete "${card.name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/channels/${params.channelId}/cards/${card.id}`, {
      method: "DELETE", headers: { "x-admin-secret": secret },
    });
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayedCards = filterRarity === "all" ? cards : cards.filter((c) => c.rarity === filterRarity);
  const cardCounts = RARITY_OPTIONS.reduce((acc, r) => ({ ...acc, [r]: cards.filter((c) => c.rarity === r).length }), {} as Record<string, number>);
  const unavailableCount = cards.filter((c) => !c.availableInPacks).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#0a0a0a]">

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/channels" className="text-zinc-500 text-sm hover:text-white transition-colors">← Channels</Link>
            {channel?.thumbnailUrl && (
              <img src={channel.thumbnailUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            )}
            <span className="text-white font-semibold text-sm">{channel?.name ?? "Loading…"}</span>
            {channel && !channel.isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800">inactive</span>
            )}
          </div>
          {channel && (
            <a href={`/${channel.slug}`} target="_blank" className="text-zinc-500 text-xs hover:text-white transition-colors">
              View ↗
            </a>
          )}
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0">
          {(["settings", "cards"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all capitalize ${
                tab === t
                  ? "border-purple-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "cards" ? `Cards (${cards.length})` : "Settings"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300 mb-6">{error}</p>}

        {/* ── SETTINGS TAB ──────────────────────────────────────────────────── */}
        {!loading && tab === "settings" && channel && (
          <div className="max-w-lg space-y-5">
            {saveMsg && <p className="text-sm rounded-xl p-3 bg-green-900/40 text-green-300">{saveMsg}</p>}

            <form onSubmit={handleSaveSettings} className="space-y-4 rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
              <h2 className="text-white font-semibold text-sm mb-2">Channel Details</h2>

              {([
                { key: "name",             label: "Display Name",                   placeholder: "Channel name" },
                { key: "slug",             label: "Slug (URL key)",                 placeholder: "url-key" },
                { key: "youtubeChannelId", label: "YouTube Channel ID",             placeholder: "UCxxxxxxxx" },
                { key: "description",      label: "Description",                    placeholder: "Optional" },
                { key: "thumbnailUrl",     label: "Thumbnail URL",                  placeholder: "https://..." },
                { key: "rewardTags",       label: "Reward Tags (comma-separated)",  placeholder: "Trading Cards, Merch" },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-zinc-400 text-xs mb-1 block">{label}</label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
                  />
                </div>
              ))}

              {/* Active toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-zinc-300 text-sm font-medium">Active</p>
                  <p className="text-zinc-500 text-xs">Visible on the home page</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isActive ? "bg-purple-600" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.isActive ? "left-6" : "left-1"}`} />
                </button>
              </div>

              <div className="flex gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-red-900/30 text-red-400 text-sm transition-colors"
                >
                  Deactivate Channel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── CARDS TAB ─────────────────────────────────────────────────────── */}
        {!loading && tab === "cards" && (
          <div className="space-y-5">

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {RARITY_OPTIONS.map((r) => (
                <div key={r} className={`rounded-xl border p-3 ${RARITY_STYLES[r]}`}>
                  <p className="text-xs opacity-70 capitalize">{r}</p>
                  <p className="text-lg font-bold">{cardCounts[r] ?? 0}</p>
                </div>
              ))}
              <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-3 text-zinc-400">
                <p className="text-xs opacity-70">Not in packs</p>
                <p className="text-lg font-bold">{unavailableCount}</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1.5 flex-1 flex-wrap">
                {["all", ...RARITY_OPTIONS].map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilterRarity(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
                      filterRarity === r
                        ? "bg-purple-900/60 border-purple-600 text-white"
                        : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {r} {r !== "all" && `(${cardCounts[r] ?? 0})`}
                  </button>
                ))}
              </div>
              <button
                onClick={openAddModal}
                className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors shrink-0"
              >
                + Add Card
              </button>
            </div>

            {/* Card grid */}
            {displayedCards.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 text-sm">
                {cards.length === 0 ? "No cards yet — add one above." : "No cards match this filter."}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayedCards.map((card) => (
                  <div
                    key={card.id}
                    className={`rounded-xl bg-zinc-900 border transition-colors space-y-2 p-2 ${
                      card.availableInPacks ? "border-zinc-800" : "border-zinc-700/40 opacity-60"
                    }`}
                  >
                    {/* Card image */}
                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800">
                      {card.imageUrl ? (
                        <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No image</div>
                      )}
                      {/* Not-in-packs badge */}
                      {!card.availableInPacks && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-zinc-300 bg-black/70 px-2 py-0.5 rounded">Unavailable</span>
                        </div>
                      )}
                      {/* Saving spinner */}
                      {patchingCard === card.id && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Name + kit */}
                    <div className="px-0.5">
                      <p className="text-white text-xs font-semibold truncate">{card.name}</p>
                      {card.kit && <p className="text-zinc-500 text-[10px] truncate">{card.kit}</p>}
                    </div>

                    {/* Inline rarity selector */}
                    <select
                      value={card.rarity}
                      disabled={patchingCard === card.id}
                      onChange={(e) => patchCard(card.id, { rarity: e.target.value })}
                      className={`w-full px-2 py-1 rounded-lg text-xs font-medium border outline-none cursor-pointer transition-colors ${RARITY_STYLES[card.rarity] ?? RARITY_STYLES.common} bg-transparent`}
                    >
                      {RARITY_OPTIONS.map((r) => (
                        <option key={r} value={r} className="bg-zinc-900 text-white capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>

                    {/* In packs toggle */}
                    <button
                      onClick={() => patchCard(card.id, { availableInPacks: !card.availableInPacks })}
                      disabled={patchingCard === card.id}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${
                        card.availableInPacks
                          ? "bg-green-900/30 border-green-800/60 text-green-400"
                          : "bg-zinc-800 border-zinc-700 text-zinc-500"
                      }`}
                    >
                      <span>{card.availableInPacks ? "In packs ✓" : "Not in packs"}</span>
                      <span className={`w-3 h-3 rounded-full border ${card.availableInPacks ? "bg-green-400 border-green-400" : "bg-zinc-600 border-zinc-600"}`} />
                    </button>

                    {/* Edit / Delete */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditModal(card)}
                        className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCard(card)}
                        className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-red-400 text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Card modal ───────────────────────────────────────────────────────── */}
      {cardModal !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveCard}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-white font-bold text-lg">
              {cardModal === "add" ? "New Card" : `Edit — ${(cardModal as DbCard).name}`}
            </h2>

            {cardError && <p className="text-red-300 text-sm bg-red-900/30 rounded-lg p-3">{cardError}</p>}

            {/* Image preview */}
            {cardForm.imageUrl && (
              <img
                src={cardForm.imageUrl}
                alt="preview"
                className="w-24 h-32 object-cover rounded-xl mx-auto border border-zinc-700"
              />
            )}

            {([
              { key: "name",         label: "Name",           required: true  },
              { key: "imageUrl",     label: "Image URL",      required: true  },
              { key: "backImageUrl", label: "Back Image URL", required: false },
              { key: "kit",          label: "Kit",            required: false },
              { key: "description",  label: "Description",    required: false },
            ] as const).map(({ key, label, required }) => (
              <div key={key}>
                <label className="text-zinc-400 text-xs mb-1 block">{label}</label>
                <input
                  type="text"
                  value={cardForm[key] as string}
                  onChange={(e) => setCardForm((f) => ({ ...f, [key]: e.target.value }))}
                  required={required}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Rarity</label>
                <select
                  value={cardForm.rarity}
                  onChange={(e) => setCardForm((f) => ({ ...f, rarity: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
                >
                  {RARITY_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Attribute</label>
                <select
                  value={cardForm.attribute}
                  onChange={(e) => setCardForm((f) => ({ ...f, attribute: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
                >
                  {["Pace", "Power", "Skill"].map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3">
              <div>
                <p className="text-zinc-300 text-sm font-medium">Available in packs</p>
                <p className="text-zinc-500 text-xs">Can this card be drawn from packs?</p>
              </div>
              <button
                type="button"
                onClick={() => setCardForm((f) => ({ ...f, availableInPacks: !f.availableInPacks }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${cardForm.availableInPacks ? "bg-purple-600" : "bg-zinc-600"}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cardForm.availableInPacks ? "left-6" : "left-1"}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setCardModal(null); setCardError(null); }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={cardSaving}
                className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {cardSaving ? "Saving…" : cardModal === "add" ? "Create Card" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
