import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/youtube.force-ssl",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      // On re-auth, NextAuth doesn't update the stored Account record, so the
      // scope column stays stale (missing youtube) even after the user grants it.
      // This handler keeps tokens and scope in sync for returning users.
      if (!isNewUser && account?.provider === "google" && user.id) {
        await prisma.account.updateMany({
          where: { userId: user.id, provider: "google" },
          data: {
            access_token: account.access_token,
            ...(account.refresh_token && { refresh_token: account.refresh_token }),
            expires_at: account.expires_at ?? null,
            scope: account.scope,
          },
        });
      }
    },
  },
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
};
