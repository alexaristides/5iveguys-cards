"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

interface Author {
  id: string;
  name: string | null;
  image: string | null;
}

interface Reply {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
  likedByMe: boolean;
  parentId: string | null;
  _count: { likes: number };
}

interface ReplyNode extends Reply {
  children: ReplyNode[];
}

interface Post {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  author: Author;
  likedByMe: boolean;
  replies: Reply[];
  _count: { likes: number; replies: number };
}

function buildTree(replies: Reply[]): ReplyNode[] {
  const map = new Map<string, ReplyNode>();
  for (const r of replies) map.set(r.id, { ...r, children: [] });
  const roots: ReplyNode[] = [];
  for (const r of replies) {
    const node = map.get(r.id)!;
    if (r.parentId && map.has(r.parentId)) {
      map.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Avatar({ user, size = 8 }: { user: Author; size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded-full shrink-0 overflow-hidden bg-zinc-700 flex items-center justify-center`}>
      {user.image
        ? <Image src={user.image} alt={user.name ?? "User"} width={40} height={40} className="object-cover w-full h-full" />
        : <span className="text-white text-xs font-bold">{user.name?.[0] ?? "?"}</span>
      }
    </div>
  );
}

interface ReplyThreadProps {
  node: ReplyNode;
  depth: number;
  userId: string | undefined;
  session: ReturnType<typeof useSession>["data"];
  channelSlug: string;
  postId: string;
  likingReply: string | null;
  replyingToId: string | null;
  setReplyingToId: (id: string | null) => void;
  onLike: (replyId: string) => void;
  onDelete: (replyId: string) => void;
  onSubmitReply: (body: string, parentId: string) => Promise<boolean>;
}

function ReplyThread({
  node,
  depth,
  userId,
  session,
  channelSlug,
  postId,
  likingReply,
  replyingToId,
  setReplyingToId,
  onLike,
  onDelete,
  onSubmitReply,
}: ReplyThreadProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isActive = replyingToId === node.id;
  // Cap visual indent at 4 levels to avoid squishing on mobile
  const indent = Math.min(depth, 4);

  useEffect(() => {
    if (isActive) textareaRef.current?.focus();
  }, [isActive]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const ok = await onSubmitReply(body.trim(), node.id);
    setSubmitting(false);
    if (ok) {
      setBody("");
      setReplyingToId(null);
    }
  }

  return (
    <div
      className={indent > 0 ? "border-l border-zinc-800 pl-3 ml-2" : ""}
    >
      {/* Reply card */}
      <div className="flex gap-2.5 py-3">
        <Avatar user={node.author} size={7} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-white text-xs font-semibold">{node.author.name?.split(" ")[0] ?? "Fan"}</span>
            <span className="text-zinc-600 text-[11px]">{timeAgo(node.createdAt)}</span>
            {userId === node.author.id && (
              <button
                onClick={() => onDelete(node.id)}
                className="ml-auto text-zinc-600 hover:text-red-400 text-[11px] transition-colors"
              >
                Delete
              </button>
            )}
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap mb-2">{node.body}</p>
          <div className="flex items-center gap-3">
            {/* Like button */}
            <button
              onClick={() => onLike(node.id)}
              disabled={likingReply === node.id || !session}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-40
                ${node.likedByMe
                  ? "bg-red-900/40 border border-red-700/50 text-red-400 hover:bg-red-900/60"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-800"
                }`}
            >
              <span>{node.likedByMe ? "♥" : "♡"}</span>
              {node._count.likes > 0 && <span>{node._count.likes}</span>}
            </button>
            {/* Reply button */}
            {session && (
              <button
                onClick={() => setReplyingToId(isActive ? null : node.id)}
                className="text-zinc-500 hover:text-purple-400 text-[11px] font-medium transition-colors"
              >
                {isActive ? "Cancel" : "↩ Reply"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline reply compose */}
      {isActive && (
        <form onSubmit={handleSubmit} className="mb-2 ml-9">
          <textarea
            ref={textareaRef}
            placeholder={`Reply to ${node.author.name?.split(" ")[0] ?? "Fan"}…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={5000}
            className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600 resize-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-zinc-700 text-[11px]">{body.length} / 5,000</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setReplyingToId(null); setBody(""); }}
                className="px-3 py-1.5 rounded-xl text-zinc-500 hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {submitting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Children */}
      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <ReplyThread
              key={child.id}
              node={child}
              depth={depth + 1}
              userId={userId}
              session={session}
              channelSlug={channelSlug}
              postId={postId}
              likingReply={likingReply}
              replyingToId={replyingToId}
              setReplyingToId={setReplyingToId}
              onLike={onLike}
              onDelete={onDelete}
              onSubmitReply={onSubmitReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ForumPostPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ channelSlug: string; postId: string }>();
  const router = useRouter();
  const { channelSlug, postId } = params;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);
  const [likingReply, setLikingReply] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);

  const fetchPost = useCallback(async () => {
    const res = await fetch(`/api/channels/${channelSlug}/forum/${postId}`);
    if (res.ok) setPost(await res.json().then((d: { post: Post }) => d.post));
    else if (res.status === 404) router.push(`/${channelSlug}/forum`);
    setLoading(false);
  }, [channelSlug, postId, router]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  async function handleLike() {
    if (liking) return;
    setLiking(true);
    const res = await fetch(`/api/channels/${channelSlug}/forum/${postId}/like`, { method: "POST" });
    if (res.ok) {
      const { liked, count } = await res.json();
      setPost((p) => p ? { ...p, likedByMe: liked, _count: { ...p._count, likes: count } } : p);
    }
    setLiking(false);
  }

  async function handleLikeReply(replyId: string) {
    if (likingReply === replyId) return;
    setLikingReply(replyId);
    const res = await fetch(`/api/channels/${channelSlug}/forum/${postId}/replies/${replyId}/like`, { method: "POST" });
    if (res.ok) {
      const { liked, count } = await res.json();
      setPost((p) =>
        p ? {
          ...p,
          replies: p.replies.map((r) =>
            r.id === replyId ? { ...r, likedByMe: liked, _count: { likes: count } } : r
          ),
        } : p
      );
    }
    setLikingReply(null);
  }

  // Top-level reply submit
  async function handleTopLevelReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/channels/${channelSlug}/forum/${postId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyBody.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setError((data.error as string) ?? "Failed to reply"); return; }
    setReplyBody("");
    await fetchPost();
  }

  // Nested reply submit — returns true on success so the inline form can close
  async function handleNestedReply(body: string, parentId: string): Promise<boolean> {
    const res = await fetch(`/api/channels/${channelSlug}/forum/${postId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId }),
    });
    if (!res.ok) return false;
    await fetchPost();
    return true;
  }

  async function handleDeletePost() {
    if (!confirm("Delete this post and all its replies?")) return;
    await fetch(`/api/channels/${channelSlug}/forum/${postId}`, { method: "DELETE" });
    router.push(`/${channelSlug}/forum`);
  }

  async function handleDeleteReply(replyId: string) {
    if (!confirm("Delete this reply?")) return;
    await fetch(`/api/channels/${channelSlug}/forum/${postId}/replies?replyId=${replyId}`, { method: "DELETE" });
    await fetchPost();
  }

  const userId = session?.user?.id;

  if (loading || status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) return null;

  const tree = buildTree(post.replies);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-32">

        <Link href={`/${channelSlug}/forum`} className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm transition-colors mb-6">
          ← Chat
        </Link>

        {/* Post card */}
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <Avatar user={post.author} size={9} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{post.author.name ?? "Fan"}</p>
              <p className="text-zinc-600 text-xs">{timeAgo(post.createdAt)}</p>
            </div>
            {userId === post.author.id && (
              <button onClick={handleDeletePost} className="text-zinc-600 hover:text-red-400 text-xs transition-colors shrink-0">
                Delete post
              </button>
            )}
          </div>

          {post.isPinned && (
            <span className="inline-block text-[10px] font-semibold text-purple-400 border border-purple-700/50 rounded px-1.5 py-0.5 mb-3">
              📌 Pinned
            </span>
          )}

          <h1 className="text-white text-xl font-bold mb-3 leading-snug">{post.title}</h1>
          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap mb-5">{post.body}</p>

          {/* Like + reply counts */}
          <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
            <button
              onClick={handleLike}
              disabled={liking || !session}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                ${post.likedByMe
                  ? "bg-red-900/40 border border-red-700/50 text-red-400 hover:bg-red-900/60"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-800"
                } disabled:opacity-50`}
            >
              <span>{post.likedByMe ? "♥" : "♡"}</span>
              <span>{post._count.likes} {post._count.likes === 1 ? "like" : "likes"}</span>
            </button>
            <span className="text-zinc-600 text-sm">
              💬 {post._count.replies} {post._count.replies === 1 ? "reply" : "replies"}
            </span>
          </div>
        </div>

        {/* Threaded replies */}
        {tree.length > 0 && (
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 px-4 mb-6 divide-y divide-zinc-800/60">
            {tree.map((node) => (
              <ReplyThread
                key={node.id}
                node={node}
                depth={0}
                userId={userId}
                session={session}
                channelSlug={channelSlug}
                postId={postId}
                likingReply={likingReply}
                replyingToId={replyingToId}
                setReplyingToId={setReplyingToId}
                onLike={handleLikeReply}
                onDelete={handleDeleteReply}
                onSubmitReply={handleNestedReply}
              />
            ))}
          </div>
        )}

        {/* Top-level reply form */}
        {status === "authenticated" ? (
          <form onSubmit={handleTopLevelReply} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
            <div className="flex gap-3 items-start">
              <Avatar
                user={{ id: userId ?? "", name: session?.user?.name ?? null, image: session?.user?.image ?? null }}
                size={8}
              />
              <div className="flex-1">
                {error && <p className="text-red-300 text-xs bg-red-900/30 rounded-lg p-2 mb-2">{error}</p>}
                <textarea
                  placeholder="Write a reply…"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-zinc-700 text-[11px]">{replyBody.length} / 5,000</span>
                  <button
                    type="submit"
                    disabled={submitting || !replyBody.trim()}
                    className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {submitting ? "Posting…" : "Reply"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 text-center">
            <p className="text-zinc-500 text-sm">Sign in to join the discussion.</p>
          </div>
        )}
      </main>
    </div>
  );
}
