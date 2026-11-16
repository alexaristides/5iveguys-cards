"use client";

import { useState } from "react";
import Link from "next/link";

interface Message {
  id: string;
  userId: string | null;
  name: string | null;
  email: string;
  message: string;
  handled: boolean;
  createdAt: string;
}

export default function AdminSupportPage() {
  const [secret, setSecret] = useState("");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(s = secret) {
    if (!s) return;
    setError(null);
    const res = await fetch("/api/admin/support", { headers: { "x-admin-secret": s } });
    if (!res.ok) return setError("Invalid secret or server error.");
    setMessages((await res.json()).messages);
  }

  async function setHandled(id: string, handled: boolean) {
    const res = await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ id, handled }),
    });
    if (res.ok) await load();
  }

  const open = messages?.filter((m) => !m.handled).length ?? 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-2xl font-bold">Admin — Support</h1>
          <Link href="/admin" className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">
            ← Admin
          </Link>
        </div>

        <div className="flex gap-3">
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onBlur={() => load()}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
          />
          <button
            onClick={() => load()}
            disabled={!secret}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm transition-all"
          >
            Refresh
          </button>
        </div>

        {error && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>}

        {messages && (
          <p className="text-zinc-500 text-sm">
            {open} open · {messages.length - open} handled
          </p>
        )}
        {messages?.length === 0 && <p className="text-zinc-500 text-sm">No messages yet.</p>}

        <div className="space-y-3">
          {messages?.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl border p-5 space-y-2 ${m.handled ? "bg-zinc-950 border-zinc-900 opacity-60" : "bg-zinc-900 border-zinc-800"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{m.name ?? "(no name)"}</p>
                  <a href={`mailto:${m.email}`} className="text-purple-400 text-xs hover:text-purple-300">
                    {m.email}
                  </a>
                  {m.userId && <span className="text-zinc-600 text-xs"> · signed in ({m.userId})</span>}
                </div>
                <p className="text-zinc-600 text-xs shrink-0">{new Date(m.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-zinc-300 text-sm whitespace-pre-wrap">{m.message}</p>
              <button
                onClick={() => setHandled(m.id, !m.handled)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
              >
                {m.handled ? "Mark open" : "Mark handled"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
