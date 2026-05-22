import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  const { postId } = await params;

  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true, image: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { postId } = await params;
  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.authorId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.forumPost.delete({ where: { id: postId } });
  return NextResponse.json({ ok: true });
}
