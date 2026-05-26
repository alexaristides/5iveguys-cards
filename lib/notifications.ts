import { prisma } from "./db";

export type NotificationType =
  | "post_liked"
  | "reply_liked"
  | "new_reply"
  | "new_nested_reply"
  | "points_earned"
  | "battle_won"
  | "battle_lost"
  | "battle_tie"
  | "welcome";

interface CreateNotificationArgs {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/** Fire-and-forget — never throws, so callers don't need try/catch */
export async function createNotification(args: CreateNotificationArgs): Promise<void> {
  try {
    await prisma.notification.create({ data: args });
  } catch (err) {
    console.error("[createNotification] failed:", err);
  }
}
