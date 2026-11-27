import type { MetadataRoute } from "next";

/** Lets phones add the site to the home screen with the 5iveG badge. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "5iveG",
    short_name: "5iveG",
    description: "The 5ive Guys fantasy football app.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F2FB",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
