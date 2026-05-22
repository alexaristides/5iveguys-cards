import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const sort = searchParams.get("sort") ?? "newest"; // newest | oldest | popular | replies

  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orderBy =
    sort === "oldest"  ? [{ isPinned: "desc" as const }, { createdAt: "asc" as const }] :
    sort === "popular" ? [{ isPinned: "desc" as const }, { likes: { _count: "desc" as const } }, { createdAt: "desc" as const }] :
    sort === "replies" ? [{ isPinned: "desc" as const }, { replies: { _count: "desc" as const } }, { createdAt: "desc" as const }] :
                         [{ isPinned: "desc" as const }, { createdAt: "desc" as const }];

  const [posts, total] = await Promise.all([
    prisma.forumPost.findMany({
      where: { channelId: channel.id },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        author: { select: { id: true, name: true, image: true } },
        _count: { select: { replies: true, likes: true } },
        ...(userId ? { likes: { where: { userId }, select: { userId: true } } } : {}),
      },
    }),
    prisma.forumPost.count({ where: { channelId: channel.id } }),
  ]);

  const enriched = posts.map((p) => ({
    ...p,
    likedByMe: userId ? ((p.likes as { userId: string }[] | undefined)?.length ?? 0) > 0 : false,
    likes: undefined,
  }));

  return NextResponse.json({ posts: enriched, total, page, pageSize: PAGE_SIZE });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { title, body } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
  }
  if (title.length > 200) return NextResponse.json({ error: "Title too long (max 200)" }, { status: 400 });
  if (body.length > 10000) return NextResponse.json({ error: "Body too long (max 10000)" }, { status: 400 });

  const post = await prisma.forumPost.create({
    data: { channelId: channel.id, authorId: session.user.id, title: title.trim(), body: body.trim() },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ post }, { status: 201 });
}
