"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

type Sort = "newest" | "oldest" | "popular" | "replies";

const SORTS: { key: Sort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "popular", label: "Most Liked" },
  { key: "replies", label: "Most Replies" },
  { key: "oldest", label: "Oldest" },
];

interface Author {
  id: string;
  name: string | null;
  image: string | null;
}

interface Post {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  author: Author;
  likedByMe: boolean;
  _count: { replies: number; likes: number };
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function Avatar({ user, size = 8 }: { user: Author; size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded-full shrink-0 overflow-hidden bg-zinc-700 flex items-center justify-center`}>
      {user.image
        ? <Image src={user.image} alt={user.name ?? "User"} width={32} height={32} className="object-cover w-full h-full" />
        : <span className="text-white text-xs font-bold">{user.name?.[0] ?? "?"}</span>
      }
    </div>
  );
}

export default function ForumPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ channelSlug: string }>();
  const router = useRouter();
  const { channelSlug } = params;

  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  const fetchPosts = useCallback(async (p: number, s: Sort) => {
    setLoading(true);
    const res = await fetch(`/api/channels/${channelSlug}/forum?page=${p}&sort=${s}`);
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts);
      setTotal(data.total);
    }
    setLoading(false);
  }, [channelSlug]);

  useEffect(() => {
    if (status === "authenticated") fetchPosts(1, sort);
  }, [status, fetchPosts, sort]);

  function changeSort(s: Sort) {
    setSort(s);
    setPage(1);
    fetchPosts(1, s);
  }

  async function handleLike(e: React.MouseEvent, postId: string) {
    e.preventDefault();
    if (likingId) return;
    setLikingId(postId);
    const res = await fetch(`/api/channels/${channelSlug}/forum/${postId}/like`, { method: "POST" });
    if (res.ok) {
      const { liked, count } = await res.json();
      setPosts((prev) => prev.map((p) => p.id === postId
        ? { ...p, likedByMe: liked, _count: { ...p._count, likes: count } }
        : p
      ));
    }
    setLikingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/channels/${channelSlug}/forum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setError((data.error as string) ?? "Failed to post"); return; }
    setShowNew(false);
    setForm({ title: "", body: "" });
    router.push(`/${channelSlug}/forum/${data.post.id}`);
  }

  const totalPages = Math.ceil(total / 20);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-28">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Forum</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{total} {total === 1 ? "post" : "posts"}</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
          >
            + New Post
          </button>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {SORTS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => changeSort(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${sort === key
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-lg mb-2">No posts yet</p>
            <p className="text-sm">Be the first to start a conversation.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.id} className="relative rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all group">
                <Link href={`/${channelSlug}/forum/${post.id}`} className="block p-4">
                  <div className="flex items-start gap-3">
                    <Avatar user={post.author} size={8} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {post.isPinned && (
                          <span className="text-[10px] font-semibold text-purple-400 border border-purple-700/50 rounded px-1.5 py-0.5">
                            📌 Pinned
                          </span>
                        )}
                        <h2 className="text-white font-semibold text-sm group-hover:text-purple-300 transition-colors leading-snug">
                          {post.title}
                        </h2>
                      </div>
                      <p className="text-zinc-500 text-xs line-clamp-2 mb-3">{post.body}</p>
                      <div className="flex items-center gap-3 text-zinc-600 text-[11px]">
                        <span>{post.author.name?.split(" ")[0] ?? "Fan"}</span>
                        <span>·</span>
                        <span>{timeAgo(post.createdAt)}</span>
                        <span>·</span>
                        <span>💬 {post._count.replies}</span>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Like button — outside the Link so it doesn't navigate */}
                <button
                  onClick={(e) => handleLike(e, post.id)}
                  disabled={likingId === post.id}
                  className={`absolute bottom-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${post.likedByMe
                      ? "bg-red-900/40 border border-red-700/50 text-red-400 hover:bg-red-900/60"
                      : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-800"
                    }`}
                >
                  <span>{post.likedByMe ? "♥" : "♡"}</span>
                  <span>{post._count.likes}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => { setPage(page - 1); fetchPosts(page - 1, sort); }} disabled={page <= 1} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 text-sm">← Prev</button>
            <span className="text-zinc-600 text-sm">{page} / {totalPages}</span>
            <button onClick={() => { setPage(page + 1); fetchPosts(page + 1, sort); }} disabled={page >= totalPages} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 text-sm">Next →</button>
          </div>
        )}
      </main>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 pt-20 overflow-y-auto">
          <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg space-y-4 mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">New Post</h2>
              <button type="button" onClick={() => { setShowNew(false); setError(null); }} className="text-zinc-500 hover:text-white transition-colors text-lg">✕</button>
            </div>
            {error && <p className="text-red-300 text-sm bg-red-900/30 rounded-lg p-3">{error}</p>}
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Title</label>
              <input
                type="text"
                placeholder="What do you want to discuss?"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                maxLength={200}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Body</label>
              <textarea
                placeholder="Write your post..."
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                required
                rows={6}
                maxLength={10000}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600 resize-none"
              />
              <p className="text-zinc-700 text-[11px] mt-1 text-right">{form.body.length} / 10,000</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowNew(false); setError(null); }} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
              <button type="submit" disabled={submitting || !form.title.trim() || !form.body.trim()} className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {submitting ? "Posting..." : "Post"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
