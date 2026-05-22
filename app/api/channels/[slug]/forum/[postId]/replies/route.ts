import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { postId } = await params;
  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Reply body is required" }, { status: 400 });
  if (body.length > 5000) return NextResponse.json({ error: "Reply too long (max 5000)" }, { status: 400 });

  const reply = await prisma.forumReply.create({
    data: { postId, authorId: session.user.id, body: body.trim() },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ reply }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const replyId = searchParams.get("replyId");
  if (!replyId) return NextResponse.json({ error: "replyId required" }, { status: 400 });

  const reply = await prisma.forumReply.findUnique({ where: { id: replyId } });
  if (!reply) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (reply.authorId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.forumReply.delete({ where: { id: replyId } });
  return NextResponse.json({ ok: true });
}
