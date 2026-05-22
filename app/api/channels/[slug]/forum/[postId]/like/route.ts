import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { postId } = await params;
  const userId = session.user.id;

  const existing = await prisma.forumLike.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.forumLike.delete({ where: { postId_userId: { postId, userId } } });
    const count = await prisma.forumLike.count({ where: { postId } });
    return NextResponse.json({ liked: false, count });
  }

  await prisma.forumLike.create({ data: { postId, userId } });
  const count = await prisma.forumLike.count({ where: { postId } });
  return NextResponse.json({ liked: true, count });
}
