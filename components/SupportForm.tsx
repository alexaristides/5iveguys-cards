"use client";

import { useState } from "react";

const input =
  "w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600";

export default function SupportForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 text-sm">
        <p className="text-white font-semibold">Thanks, we&rsquo;ve got your message.</p>
        <p className="text-zinc-400 mt-1">We&rsquo;ll reply to {email} as soon as we can.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input className={input} placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      <input
        className={input}
        type="email"
        required
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        maxLength={200}
      />
      <textarea
        className={`${input} min-h-36`}
        required
        placeholder="How can we help?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={5000}
      />
      <input
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      {error && <p className="text-sm rounded-xl p-3 bg-red-900/40 text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-all"
      >
        {state === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
