import type { MetadataRoute } from "next";

/** Lets phones add the site to the home screen with the 5iveG badge. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "5iveG",
    short_name: "5iveG",
    description: "The fantasy football app for the 5ive Guys YouTube channel.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
