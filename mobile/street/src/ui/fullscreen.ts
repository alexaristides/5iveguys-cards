/**
 * Full screen on the website, on phones and tablets (the app is full screen
 * already, and a desktop browser is left alone).
 *
 * Where the browser allows it (Android, iPad), the first tap goes full screen
 * with the browser's bars hidden and turns the game sideways, and a tap after
 * leaving full screen goes back in.
 *
 * iPhone Safari won't put a page full screen, but held sideways its bars tuck
 * away when the page is scrolled. So while they're showing, a "swipe up" card
 * makes the page scrollable for one swipe; once they've gone it's locked again.
 * Added to the Home Screen it opens full screen anyway (meta tags in index.html).
 */
type FsDocument = Document & { webkitFullscreenElement?: Element | null };
type FsElement = HTMLElement & { webkitRequestFullscreen?: (opts?: FullscreenOptions) => Promise<void> | void };
type Lockable = ScreenOrientation & { lock?: (o: string) => Promise<void> };

export function installFullscreen(inApp: boolean) {
  if (inApp || !matchMedia("(pointer: coarse)").matches) return;
  const root = document.documentElement as FsElement;
  const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
  if (request) {
    const doc = document as FsDocument;
    const go = () => {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
      try {
        Promise.resolve(request({ navigationUI: "hide" }))
          .then(() => (screen.orientation as Lockable | undefined)?.lock?.("landscape"))
          .catch(() => { /* refused: carry on in the browser */ });
      } catch { /* not allowed here */ }
    };
    // Only a tap (a finished touch) may open full screen.
    addEventListener("pointerup", go, true);
    addEventListener("touchend", go, true);
    return;
  }
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone)").matches;
  if (!standalone) swipeToHideBars();
}

/**
 * iPhone Safari: the page is made taller than the screen (everything you see is
 * fixed, so it doesn't move) but can only be scrolled behind a "swipe up" card,
 * shown when the phone's turned sideways. Swiping tucks the bars away and the
 * card goes; then it's locked where it is (scrolling back up would bring them
 * back). If the bars come back (the page gets shorter again), so does the card.
 * Tapping the card plays on without full screen.
 */
function swipeToHideBars() {
  const html = document.documentElement;
  html.classList.add("ios-bars");
  const card = document.createElement("div");
  card.id = "swipe";
  card.innerHTML = `<div class="hand">↑</div><div class="display">Swipe up</div><div class="sub">for full screen · or tap to play</div>
    <div class="tip">Full screen every time: Share <b>⎙</b> → <b>Add to Home Screen</b></div>`;
  const room = document.createElement("div");
  room.id = "swipe-room";
  document.body.append(card, room);

  let wasLandscape: boolean | null = null;
  /** Swiped (or tapped) since turning sideways, and the tallest the page has been since. */
  let done = false;
  let tallest = 0;
  let lastY = scrollY;
  const show = (on: boolean) => {
    if (on === html.classList.contains("swipe")) return;
    // Back to the top, so there's room to swipe up into.
    if (on) { scrollTo(0, 0); lastY = scrollY; }
    html.classList.toggle("swipe", on);
  };
  const dismiss = () => {
    done = true;
    tallest = innerHeight;
    show(false);
  };
  const update = () => {
    const landscape = innerWidth > innerHeight;
    if (landscape !== wasLandscape) { wasLandscape = landscape; done = false; }
    if (!landscape) { show(false); return; }
    if (!done) { show(true); return; }
    tallest = Math.max(tallest, innerHeight);
    if (innerHeight < tallest - 30) { done = false; show(true); }
  };
  // A swipe up scrolls the page down from the highest it's been since the card showed.
  // Only while a finger's on the card (or just let go): Safari scrolls the page about
  // itself too, e.g. back to the top when the bars come back.
  let touchedAt = -Infinity;
  card.addEventListener("touchstart", () => { touchedAt = Infinity; }, { passive: true });
  card.addEventListener("touchend", () => { touchedAt = performance.now(); }, { passive: true });
  addEventListener("scroll", () => {
    const down = scrollY - lastY;
    lastY = Math.min(lastY, scrollY);
    const swiping = performance.now() - touchedAt < 800;
    if (html.classList.contains("swipe") && swiping && down > 30) dismiss();
    else update();
  }, { passive: true });
  card.addEventListener("click", dismiss);
  addEventListener("resize", update);
  visualViewport?.addEventListener("resize", update);
  // Safari's resize events come while the bars are still moving: check again once they've settled.
  setInterval(update, 400);
  update();
}
