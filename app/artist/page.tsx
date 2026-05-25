import Image from "next/image";
import Link from "next/link";

export default function ArtistPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6 pt-24 pb-20">

        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm transition-colors mb-10">
          ← Home
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-purple-400 text-sm font-semibold uppercase tracking-widest mb-3">The Artist</p>
          <h1 className="text-4xl font-bold text-white">Behind the Cards</h1>
        </div>

        {/* Artist card */}
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">

          {/* Profile section */}
          <div className="flex flex-col items-center pt-10 pb-8 px-8 text-center">
            <div className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-purple-600/50 mb-5 shrink-0">
              <Image
                src="https://scontent-lhr6-1.cdninstagram.com/v/t51.82787-19/645835118_18444493102128902_7451309450422417395_n.jpg?efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby44NTguYzIifQ&_nc_ht=scontent-lhr6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gHksTkWw4AZdzx5wFA8Wgs062g__P9zWLGYBz44_EUqEd2HUypXhlUtPfRopRSQ61GV1kJKKW69WJL9gOaqvOXn&_nc_ohc=VLU98CrkQUAQ7kNvwF4wXY6&_nc_gid=-kU53urhg_HQheTNs_Ba3w&edm=AP4sbd4BAAAA&ccb=7-5&oh=00_Af6UBgkT-91h6FjpxOekejVxHx5b5RtliXoUBxSAwFnZTg&oe=6A165A24&_nc_sid=7a9f4b"
                alt="Merle"
                fill
                className="object-cover"
                unoptimized
              />
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">Merle</h2>
            <p className="text-purple-400 text-sm font-medium mb-6">Card Artist</p>

            <p className="text-zinc-300 text-base leading-relaxed max-w-md mb-4">
              Every card in the collection is hand-crafted by Merle — a seriously talented artist whose
              eye for detail and creative style brings each player to life in a way that&apos;s completely
              unique to 5iveguysfc.
            </p>
            <p className="text-zinc-400 text-base leading-relaxed max-w-md mb-8">
              From the common cards to the rarest legends, Merle puts real care into every design.
              If you&apos;ve pulled a card and thought &ldquo;this looks incredible&rdquo; — that&apos;s all him.
              Go and show him some love.
            </p>

            <a
              href="https://www.instagram.com/drivermerle/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-sm transition-all shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              @drivermerle
            </a>
          </div>

          {/* Footer strip */}
          <div className="bg-zinc-800/50 border-t border-zinc-800 px-8 py-4 text-center">
            <p className="text-zinc-600 text-xs">All card artwork is original and created exclusively for 5iveG.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
