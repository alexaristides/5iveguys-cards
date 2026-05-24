import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string; postId: string; replyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { replyId } = await params;
  const userId = session.user.id;

  const existing = await prisma.forumReplyLike.findUnique({
    where: { replyId_userId: { replyId, userId } },
  });

  if (existing) {
    await prisma.forumReplyLike.delete({ where: { replyId_userId: { replyId, userId } } });
    const count = await prisma.forumReplyLike.count({ where: { replyId } });
    return NextResponse.json({ liked: false, count });
  }

  await prisma.forumReplyLike.create({ data: { replyId, userId } });
  const count = await prisma.forumReplyLike.count({ where: { replyId } });
  return NextResponse.json({ liked: true, count });
}
