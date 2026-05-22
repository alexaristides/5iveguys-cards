import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const { postId } = await params;

  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true, image: true } },
      _count: { select: { likes: true, replies: true } },
      ...(userId ? { likes: { where: { userId }, select: { userId: true } } } : {}),
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const enriched = {
    ...post,
    likedByMe: userId ? ((post.likes as { userId: string }[] | undefined)?.length ?? 0) > 0 : false,
    likes: undefined,
  };

  return NextResponse.json({ post: enriched });
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
