import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { SignInScreen } from "@/components/SignInScreen";
import { authOptions } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/web-session";

export const metadata: Metadata = { title: "Sign in" };

/** Every sign-in option, then back to `callbackUrl`. `error=apple` when Sign in with Apple failed. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(params.callbackUrl);
  if (await getServerSession(authOptions)) redirect(callbackUrl);
  return <SignInScreen callbackUrl={callbackUrl} error={typeof params.error === "string" ? params.error : undefined} />;
}
