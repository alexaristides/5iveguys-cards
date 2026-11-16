import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isWorld, worldName } from "@/lib/worlds";
import ChannelShell from "./ChannelShell";

export default async function ChannelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ channelSlug: string }>;
}) {
  const { channelSlug } = await params;
  if (!isWorld(channelSlug)) notFound();
  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });

  if (!channel || !channel.isActive) notFound();

  return (
    <ChannelShell channel={{ id: channel.id, slug: channel.slug, name: worldName(channel.slug) ?? channel.name, thumbnailUrl: channel.thumbnailUrl }}>
      {children}
    </ChannelShell>
  );
}
