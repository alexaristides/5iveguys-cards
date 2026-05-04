"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already linked to another sign-in method. Please sign in again.",
  AccessDenied: "Access was denied. Make sure you're added as a test user.",
  Configuration: "Server configuration error. Contact the developer.",
  Default: "Something went wrong. Please try again.",
};

function ErrorContent() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error") ?? "Default";
  const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto mb-6">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-white text-2xl font-bold mb-3">Sign-in Error</h1>
        <p className="text-zinc-400 mb-8">{message}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => signIn("google")}
            className="px-6 py-3 rounded-2xl bg-white text-black font-semibold hover:bg-zinc-100 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 rounded-2xl bg-zinc-900 text-zinc-400 font-medium hover:text-white transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
