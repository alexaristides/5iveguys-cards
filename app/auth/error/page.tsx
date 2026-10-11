import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedAppRedirect, REDIRECT_COOKIE } from "@/lib/mobile-auth";
import ErrorContent from "./AuthError";

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Inside the iOS app's auth sheet (e.g. Connect YouTube with a Google account
  // that already has its own profile): hand the error back to the app instead.
  const appRedirect = (await cookies()).get(REDIRECT_COOKIE)?.value ?? "";
  if (isAllowedAppRedirect(appRedirect)) {
    const { error } = await searchParams;
    redirect(`/api/mobile/auth/web-finish?error=${encodeURIComponent(error ?? "Default")}`);
  }

  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
