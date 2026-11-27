"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { signInBasic } from "@/components/SignInScreen";

/**
 * The burger menu: Extras (everything the website has beyond the app), then the app's Settings sheet:
 * your account, the intro, help, privacy, terms, sign out and delete account.
 * A sheet from the bottom on phones (like the app), a panel under the button on wider screens.
 */
export function AppMenu() {
  const path = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const user = session?.user;

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function deleteAccount() {
    const ok = window.confirm(
      "Delete account?\n\nThis permanently deletes your account and your fantasy team, and takes you out of every league. This can't be undone.",
    );
    if (!ok) return;
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      await signOut({ callbackUrl: "/" });
    } else {
      setDeleting(false);
      window.alert("Couldn't delete account. Please try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-[38px] h-[38px] rounded-full bg-white shadow-card flex flex-col items-center justify-center gap-[5px] text-ink hover:bg-violet-50 transition-colors"
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="block w-[18px] h-[2px] rounded-full bg-current" />
        <span className="block w-[18px] h-[2px] rounded-full bg-current" />
        <span className="block w-[18px] h-[2px] rounded-full bg-current" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 [color-scheme:light]" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-[#160B2E]/30 md:bg-[#160B2E]/10 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[24px] bg-lilac px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl
              md:inset-x-auto md:bottom-auto md:top-[72px] md:right-6 md:w-[380px] md:rounded-[24px] md:pt-5"
          >
            <div className="md:hidden mx-auto mb-4 h-[5px] w-9 rounded-full bg-ink-3/40" aria-hidden />

            <div className="space-y-[18px]">
              {user ? (
                <div className="flex items-center gap-3.5">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" className="w-[52px] h-[52px] rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="w-[52px] h-[52px] rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xl font-extrabold">
                      {(user.name ?? "?")[0]?.toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-xl font-black truncate">{user.name ?? "Signed in"}</p>
                    {user.email && <p className="text-ink-2 text-sm truncate">{user.email}</p>}
                  </div>
                  <CloseButton onClick={() => setOpen(false)} />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => signInBasic(path)}
                    className="flex-1 h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-[17px] font-extrabold"
                  >
                    Sign in
                  </button>
                  <CloseButton onClick={() => setOpen(false)} />
                </div>
              )}

              <Group>
                <Row href="/extras" emoji="✨" label="Extras" detail="5IVE STREET, games, cards and points" last />
              </Group>

              <Group>
                <Row href="/tour" label="Show the intro again" />
                <Row href="/support" label="Help & Support" />
                <Row href="/privacy" label="Privacy Policy" />
                <Row href="/terms" label="Terms of Service" last={!user} />
                {user && <RowButton label="Sign out" onClick={() => signOut({ callbackUrl: "/" })} last />}
              </Group>

              {user && (
                <Group>
                  <RowButton label={deleting ? "Deleting…" : "Delete account"} onClick={deleteAccount} danger last disabled={deleting} />
                </Group>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 shrink-0 rounded-full bg-white shadow-card text-ink-2 hover:text-ink text-xl leading-none flex items-center justify-center"
      aria-label="Close menu"
    >
      ×
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[18px] bg-white shadow-card overflow-hidden">{children}</div>;
}

const rowClass = (last?: boolean) =>
  `w-full flex items-center gap-3 px-4 py-[15px] text-left hover:bg-lilac-2 transition-colors ${last ? "" : "border-b border-lilac-line"}`;

function Row({ href, label, detail, emoji, last }: { href: string; label: string; detail?: string; emoji?: string; last?: boolean }) {
  return (
    <Link href={href} className={rowClass(last)}>
      {emoji && <span className="w-9 h-9 shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-lg" aria-hidden>{emoji}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-ink text-base font-bold">{label}</span>
        {detail && <span className="block text-ink-3 text-sm">{detail}</span>}
      </span>
      <span className="text-ink-3 text-xl leading-none font-semibold" aria-hidden>›</span>
    </Link>
  );
}

function RowButton({ label, onClick, danger, last, disabled }: { label: string; onClick: () => void; danger?: boolean; last?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${rowClass(last)} disabled:opacity-50`}>
      <span className={`text-base font-bold ${danger ? "text-red-600" : "text-ink"}`}>{label}</span>
    </button>
  );
}
