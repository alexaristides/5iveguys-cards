"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import CardModal from "./CardModal";
import { dbCardToCard, Rarity } from "@/lib/cards";

// ── Column tooltip ─────────────────────────────────────────────────────────────
function ColumnTooltip({ text }: { text: string }) {
  return (
    <span className="relative group/tip inline-flex items-center ml-1 align-middle">
      <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-zinc-400 text-[9px] font-bold flex items-center justify-center cursor-help leading-none">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] leading-snug opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50 whitespace-normal text-left shadow-xl">
        {text}
      </span>
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatedCard {
  id: string;
  name: string;
  kit: string | null;
  rarity: Rarity;
  imageUrl: string;
  channel: { id: string; name: string; slug: string; thumbnailUrl: string | null };
  position: string | null;
  overall: number;
  voteCount: number;
  change: number;
  sparkline: number[];
}

interface Channel {
  id: string;
  name: string;
  slug: string;
}

type SortKey = "top" | "risers" | "fallers" | "votes";
type Period  = "1d" | "7d" | "30d";

// ── Rarity colours ────────────────────────────────────────────────────────────

const RARITY_BADGE: Record<Rarity, string> = {
  common:    "bg-zinc-700/70 text-zinc-300",
  rare:      "bg-blue-900/70 text-blue-300",
  epic:      "bg-purple-900/70 text-purple-300",
  legendary: "bg-amber-900/70 text-amber-300",
};

const RARITY_OVR: Record<Rarity, string> = {
  common:    "text-zinc-300",
  rare:      "text-blue-300",
  epic:      "text-purple-300",
  legendary: "text-amber-300",
};

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ data, rarity, width = 72, height = 24 }: { data: number[]; rarity: Rarity; width?: number; height?: number }) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} strokeDasharray="3 3" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${(width - pad).toFixed(1)},${height} L${pad},${height} Z`;

  const color = rarity === "legendary" ? "#fbbf24" : rarity === "epic" ? "#c084fc" : rarity === "rare" ? "#60a5fa" : "#a1a1aa";
  const gradId = `spark-${rarity}`;

  const trend = data[data.length - 1] - data[0];
  const strokeColor = trend > 0 ? "#4ade80" : trend < 0 ? "#f87171" : color;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last dot */}
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2" fill={strokeColor} />
    </svg>
  );
}

// ── OVR Area Chart (in modal) ─────────────────────────────────────────────────

interface HistoryPoint { day: string; overall: number; voteCount: number }

function OvrAreaChart({ history, width = 480, height = 180 }: { history: HistoryPoint[]; width?: number; height?: number }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
        Not enough data yet — vote to build the chart!
      </div>
    );
  }

  const pad = { top: 16, right: 16, bottom: 32, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = history.map((h) => h.overall);
  const minV = Math.max(0, Math.min(...values) - 5);
  const maxV = Math.min(100, Math.max(...values) + 5);
  const rangeV = maxV - minV || 1;

  const toX = (i: number) => pad.left + (i / (history.length - 1)) * innerW;
  const toY = (v: number) => pad.top + (1 - (v - minV) / rangeV) * innerH;

  const linePath = history.map((h, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(h.overall).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${toX(history.length - 1).toFixed(1)},${pad.top + innerH} L${toX(0).toFixed(1)},${pad.top + innerH} Z`;

  // Y-axis ticks
  const yTicks = [minV, minV + rangeV * 0.25, minV + rangeV * 0.5, minV + rangeV * 0.75, maxV].map(Math.round);

  // X-axis ticks (show ~5 dates)
  const step = Math.max(1, Math.floor(history.length / 5));
  const xTicks = history.filter((_, i) => i % step === 0 || i === history.length - 1).map((h, _, arr) => ({
    label: h.day.slice(5), // MM-DD
    x: toX(history.indexOf(h)),
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <defs>
        <linearGradient id="ovrGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.left} y1={toY(v)} x2={pad.left + innerW} y2={toY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={pad.left - 6} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.3)">{v}</text>
        </g>
      ))}

      {/* Area + line */}
      <path d={areaPath} fill="url(#ovrGrad)" />
      <path d={linePath} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {history.map((h, i) => (
        <circle key={i} cx={toX(i)} cy={toY(h.overall)} r="3" fill="#a855f7" />
      ))}

      {/* X labels */}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={height - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.3)">{t.label}</text>
      ))}
    </svg>
  );
}

// ── Chart Modal ───────────────────────────────────────────────────────────────

function ChartModal({ card, onClose }: { card: RatedCard; onClose: () => void }) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/cards/${card.id}/rating-history?period=${period}`)
      .then((r) => r.ok ? r.json() : { history: [] })
      .then((d) => { setHistory(d.history ?? []); setLoading(false); });
  }, [card.id, period]);

  if (!mounted) return null;

  const latestOverall = history.length > 0 ? history[history.length - 1].overall : card.overall;
  const firstOverall  = history.length > 0 ? history[0].overall : card.overall;
  const totalChange   = latestOverall - firstOverall;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
      <div
        className="relative z-10 w-full max-w-lg bg-zinc-950 border border-white/8 rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-14 rounded-lg overflow-hidden border border-white/10">
              <Image src={card.imageUrl} alt={card.name} fill className="object-cover" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">{card.name}</p>
              {card.kit && <p className="text-zinc-500 text-xs">{card.kit}</p>}
              <p className="text-zinc-600 text-xs">{card.channel.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* OVR summary */}
        <div className="flex items-center gap-6 px-5 py-4 border-b border-white/8">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">Current OVR</p>
            <p className={`text-3xl font-black tabular-nums ${RARITY_OVR[card.rarity]}`}>{card.overall}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">Period change</p>
            <p className={`text-xl font-bold tabular-nums ${totalChange > 0 ? "text-green-400" : totalChange < 0 ? "text-red-400" : "text-zinc-400"}`}>
              {totalChange > 0 ? "+" : ""}{totalChange}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">Votes</p>
            <p className="text-xl font-bold text-zinc-300 tabular-nums">{card.voteCount}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 px-5 pt-4">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                period === p ? "bg-purple-600 text-white" : "text-zinc-500 hover:text-white"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <OvrAreaChart history={history} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Card Row ──────────────────────────────────────────────────────────────────

function CardRow({ card, rank, onViewCard, onViewChart }: {
  card: RatedCard;
  rank: number;
  onViewCard: (card: RatedCard) => void;
  onViewChart: (card: RatedCard) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group cursor-pointer" onClick={() => onViewCard(card)}>
      {/* Rank */}
      <span className="text-zinc-600 text-xs font-bold tabular-nums w-5 text-right shrink-0">{rank}</span>

      {/* Card image */}
      <div className="relative w-9 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0">
        <Image src={card.imageUrl} alt={card.name} fill className="object-cover" sizes="36px" />
      </div>

      {/* Name + channel */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate leading-tight">{card.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {card.position && card.position !== "Moment" && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/10 text-zinc-400 shrink-0">{card.position}</span>
          )}
          {card.kit && <span className="text-zinc-500 text-[11px] truncate">{card.kit}</span>}
          <span className="text-zinc-700 text-[11px]">·</span>
          <span className="text-zinc-600 text-[11px] truncate">{card.channel.name}</span>
        </div>
      </div>

      {/* Rarity badge */}
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize shrink-0 hidden sm:inline ${RARITY_BADGE[card.rarity]}`}>
        {card.rarity}
      </span>

      {/* OVR */}
      <div className="text-right shrink-0 w-10">
        <p className={`text-base font-black tabular-nums leading-tight ${RARITY_OVR[card.rarity]}`}>{card.overall}</p>
        <p className="text-zinc-600 text-[9px] uppercase tracking-widest">ovr</p>
      </div>

      {/* Change */}
      <div className="text-right shrink-0 w-10">
        {card.change !== 0 ? (
          <span className={`text-xs font-bold tabular-nums ${card.change > 0 ? "text-green-400" : "text-red-400"}`}>
            {card.change > 0 ? "+" : ""}{card.change}
          </span>
        ) : (
          <span className="text-zinc-700 text-xs">—</span>
        )}
      </div>

      {/* Sparkline */}
      <div className="shrink-0 hidden md:block" onClick={(e) => { e.stopPropagation(); onViewChart(card); }} title="View rating chart">
        <Sparkline data={card.sparkline} rarity={card.rarity} />
      </div>

      {/* Chart button */}
      <button
        className="shrink-0 p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all text-zinc-500 hover:text-purple-400 hover:bg-purple-900/30"
        onClick={(e) => { e.stopPropagation(); onViewChart(card); }}
        title="View rating chart"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CardRatingsLeaderboard({ channels }: { channels: Channel[] }) {
  const [sort, setSort]         = useState<SortKey>("top");
  const [period, setPeriod]     = useState<Period>("7d");
  const [channelId, setChannelId] = useState<string>("all");
  const [rarity, setRarity]     = useState<string>("all");
  const [cards, setCards]       = useState<RatedCard[]>([]);
  const [loading, setLoading]   = useState(true);

  const [selectedCard, setSelectedCard]   = useState<RatedCard | null>(null);
  const [chartCard, setChartCard]         = useState<RatedCard | null>(null);

  const fetchRef = useRef<AbortController | null>(null);

  const fetchLeaderboard = useCallback(() => {
    fetchRef.current?.abort();
    const ctrl = new AbortController();
    fetchRef.current = ctrl;
    setLoading(true);

    const params = new URLSearchParams({ sort, period });
    if (channelId !== "all") params.set("channelSlug", channelId); // component uses slug as id
    if (rarity    !== "all") params.set("rarity", rarity);

    fetch(`/api/cards/ratings?${params}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : { cards: [] })
      .then((d) => { setCards(d.cards ?? []); setLoading(false); })
      .catch(() => { /* aborted */ });
  }, [sort, period, channelId, rarity]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const SORT_TABS: { key: SortKey; label: string; icon: string }[] = [
    { key: "top",    label: "Top Rated",  icon: "🏆" },
    { key: "risers", label: "Risers",     icon: "📈" },
    { key: "fallers",label: "Fallers",    icon: "📉" },
    { key: "votes",  label: "Most Voted", icon: "🔥" },
  ];

  return (
    <div className="space-y-4">
      {/* Sort tabs */}
      <div className="flex gap-1 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 w-fit flex-wrap">
        {SORT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSort(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
              ${sort === tab.key ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Period */}
        <div className="flex gap-1">
          {(["1d", "7d", "30d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                period === p ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300 border border-zinc-800"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-zinc-800" />

        {/* Channel filter */}
        {channels.length > 1 && (
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-600 transition-colors"
          >
            <option value="all">All Channels</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        )}

        {/* Rarity filter */}
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-600 transition-colors"
        >
          <option value="all">All Rarities</option>
          <option value="legendary">Legendary</option>
          <option value="epic">Epic</option>
          <option value="rare">Rare</option>
          <option value="common">Common</option>
        </select>
      </div>

      {/* Leaderboard table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/80">
          <span className="w-5 shrink-0" />
          <span className="w-9 shrink-0" />
          <span className="flex-1 text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Card</span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold w-16 text-right shrink-0 hidden sm:block">Rarity</span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold w-10 text-right shrink-0">OVR<ColumnTooltip text="Overall rating from fan votes, weighted for each card's position so specialists (e.g. keepers) aren't penalised on irrelevant attributes" /></span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold w-10 text-right shrink-0">Chg<ColumnTooltip text="Change in OVR over the selected time period" /></span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold w-[72px] text-center shrink-0 hidden md:block">Trend<ColumnTooltip text="7-day rating history — click to vote or see full chart" /></span>
          <span className="w-7 shrink-0" />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cards.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-zinc-500 text-sm">
              {sort === "risers" ? "No cards with rising ratings yet" :
               sort === "fallers" ? "No cards with falling ratings yet" :
               "No rated cards yet — be the first to vote!"}
            </p>
            <p className="text-zinc-700 text-xs mt-1">Open any card to cast your rating</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40">
            {cards.map((card, i) => (
              <CardRow
                key={card.id}
                card={card}
                rank={i + 1}
                onViewCard={setSelectedCard}
                onViewChart={setChartCard}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context hint */}
      {!loading && cards.length > 0 && (
        <p className="text-zinc-700 text-[11px] text-center">
          Click a card to view stats · click the chart icon or trend line to see rating history
        </p>
      )}

      {/* Card modal */}
      {selectedCard && (
        <CardModal
          card={dbCardToCard({
            id: selectedCard.id,
            name: selectedCard.name,
            kit: selectedCard.kit,
            rarity: selectedCard.rarity,
            imageUrl: selectedCard.imageUrl,
            backImageUrl: null,
            attribute: null,
            description: null,
            position: selectedCard.position,
          })}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {/* Chart modal */}
      {chartCard && <ChartModal card={chartCard} onClose={() => setChartCard(null)} />}
    </div>
  );
}
