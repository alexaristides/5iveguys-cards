import type { ReactNode } from "react";
import { primaryButton, secondaryButton } from "@/components/AppShell";

/** The app's ActivityIndicator, in the current text colour. */
export function ActivityIndicator({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

/**
 * The app's Button (mobile/src/components/ui.tsx): dimmed only when disabled; while loading it shows
 * a spinner at full strength and ignores presses.
 */
export function Button({ title, onPress, variant = "primary", disabled, loading, className = "" }: {
  title: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => { if (!loading) onPress(); }}
      disabled={disabled}
      aria-disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${variant === "secondary" ? secondaryButton : primaryButton} flex items-center justify-center active:opacity-85 ${className}`}
    >
      {loading ? <ActivityIndicator /> : title}
    </button>
  );
}
