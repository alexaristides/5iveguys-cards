"use client";

import { useEffect, useRef } from "react";

/**
 * While there are unsaved changes, links that leave the page (‹ Back, the tabs, the menu) ask first,
 * like the app's team picker (no swipe back, and Back asks "Leave without saving?"). `ask` gets a
 * `leave` to call if the fan says yes, which follows the link as it would have gone. Reloading or
 * closing the tab gets the browser's own "Leave site?" prompt.
 */
export function useLeaveGuard(active: boolean, ask: (leave: () => void) => void) {
  const latest = useRef(ask);
  const leaving = useRef(false);
  useEffect(() => { latest.current = ask; });

  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return;
      // Stop it before Next's <Link> (or the browser) sees it.
      e.preventDefault();
      e.stopPropagation();
      latest.current(() => {
        leaving.current = true;
        if (link.isConnected) link.click();
        else window.location.assign(link.href);
      });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);
}
