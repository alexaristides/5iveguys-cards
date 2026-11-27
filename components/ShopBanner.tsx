import Link from "next/link";
import { PRINT_SHOP, formatPounds, isFirstEdition, packImage } from "@/lib/print-shop";

/** The printed-packs promo on the home pages ("coming soon" while PRINT_SHOP.forSale is off). Links to /shop. */
export default function ShopBanner() {
  const firstEdition = isFirstEdition(new Date());
  return (
    <Link
      href="/shop"
      className="group relative block overflow-hidden rounded-3xl border border-amber-300/20 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(147,51,234,0.35),transparent_55%),radial-gradient(80%_100%_at_0%_100%,rgba(245,158,11,0.12),transparent_60%)] bg-zinc-950 transition hover:border-amber-300/40"
    >
      <div className="grid md:grid-cols-[1.15fr_1fr] items-center">
        <div className="relative z-10 p-6 sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300" aria-hidden />
            {!PRINT_SHOP.forSale ? (
              "Coming soon"
            ) : firstEdition ? (
              <>
                1st Edition<span className="hidden sm:inline"> · order by {PRINT_SHOP.printStarts}</span>
              </>
            ) : (
              "Printed packs"
            )}
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-[1.05]">
            Real trading card packs,
            <br className="hidden sm:block" /> posted to your door
          </h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base max-w-md">
            {!PRINT_SHOP.forSale
              ? "1st Edition packs of the real squad are on the way. Buying packs is coming soon."
              : firstEdition
              ? `Every card in orders placed before ${PRINT_SHOP.printStarts} is 1st Edition, and we post them by ${PRINT_SHOP.postBy}.`
              : "Rip a squad pack, or pick a player's pack to guarantee their card."}
          </p>
          <p className="mt-5 text-white font-semibold">
            {formatPounds(PRINT_SHOP.packPence)} a pack ·{" "}
            <span className="text-purple-300">
              any {PRINT_SHOP.bundle.size} for {formatPounds(PRINT_SHOP.bundle.pence)}
            </span>
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition group-hover:bg-amber-100">
            {PRINT_SHOP.forSale ? "Shop the packs" : "Take a look"} <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
        <div className="relative h-56 sm:h-72 md:h-full md:min-h-[320px]" aria-hidden>
          {[
            { id: "Milo", cls: "left-[14%] -rotate-[10deg] translate-y-3" },
            { id: "Theo", cls: "right-[14%] rotate-[10deg] translate-y-3" },
            { id: "Squad", cls: "left-1/2 -translate-x-1/2 z-10 -translate-y-1 group-hover:-translate-y-3" },
          ].map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={packImage(p.id)}
              alt=""
              className={`absolute top-6 md:top-1/2 md:-mt-[130px] w-[30%] max-w-[150px] rounded-lg shadow-2xl shadow-black/70 transition-transform duration-300 ${p.cls}`}
            />
          ))}
        </div>
      </div>
    </Link>
  );
}
