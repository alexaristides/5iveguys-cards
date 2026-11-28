import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next lint` and `next build` lint the whole repo; eslint.config.mjs decides what is skipped (mobile/, public/street/ …).
  eslint: { dirs: ["."] },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },
  async rewrites() {
    // 5IVE STREET is a static page built from mobile/street (npm run build:street).
    return [{ source: "/street", destination: "/street/index.html" }];
  },
  async redirects() {
    // The World Cup games are over; old links land on the new game instead.
    return [
      { source: "/draft", destination: "/street", permanent: false },
      { source: "/game/worldcup", destination: "/street", permanent: false },
      // Printed packs aren't sold any more (the website is the fantasy app). /shop/thanks stays for past orders.
      { source: "/shop", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
