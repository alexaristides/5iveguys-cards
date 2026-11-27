/** The 5iveG logo: the purple "5" badge with the wordmark (public/brand, made by scripts/brand-logo.mjs). */
export function Logo({ className = "h-7", ink }: { className?: string; /** The dark-ink version, for light pages. */ ink?: boolean }) {
  const src = ink ? "/brand/5iveg-logo-black.svg" : "/brand/5iveg-logo-white.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="5iveG" width={516} height={145} className={`${className} w-auto`} />;
}

/** Just the badge. */
export function LogoMark({ className = "h-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/5iveg-mark.svg" alt="" width={487} height={463} className={`${className} w-auto`} />;
}

/** For pages with a light theme too: the dark-ink logo in light mode, the white one in dark mode. */
export function ThemedLogo({ className = "h-7" }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/5iveg-logo-black.svg" alt="5iveG" width={516} height={145} className={`${className} w-auto dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/5iveg-logo-white.svg" alt="5iveG" width={516} height={145} className={`${className} w-auto hidden dark:block`} />
    </>
  );
}
