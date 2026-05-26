import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string; postId: string; replyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, postId, replyId } = await params;
  const userId = session.user.id;

  const existing = await prisma.forumReplyLike.findUnique({
    where: { replyId_userId: { replyId, userId } },
  });

  if (existing) {
    await prisma.forumReplyLike.delete({ where: { replyId_userId: { replyId, userId } } });
    const count = await prisma.forumReplyLike.count({ where: { replyId } });
    return NextResponse.json({ liked: false, count });
  }

  const [, reply] = await Promise.all([
    prisma.forumReplyLike.create({ data: { replyId, userId } }),
    prisma.forumReply.findUnique({ where: { id: replyId }, select: { authorId: true, body: true } }),
  ]);
  const count = await prisma.forumReplyLike.count({ where: { replyId } });

  if (reply && reply.authorId !== userId) {
    await createNotification({
      userId: reply.authorId,
      type: "reply_liked",
      title: `${session.user.name ?? "Someone"} liked your reply`,
      body: reply.body.slice(0, 80),
      link: `/${slug}/forum/${postId}`,
    });
  }

  return NextResponse.json({ liked: true, count });
}
