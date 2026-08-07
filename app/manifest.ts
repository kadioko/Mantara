import type { MetadataRoute } from "next";

/**
 * Keeps the Mantara mark visible when the web app is installed from Chrome, Android, or iOS.
 * The source logo is a square 1254px PNG, giving browsers enough resolution for all shortcut sizes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mantara — Mining Operations",
    short_name: "Mantara",
    description: "Mining intelligence and operations platform.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fbf8",
    theme_color: "#064e3b",
    icons: [
      { src: "/brand/mantara-mark.png", sizes: "1254x1254", type: "image/png", purpose: "any" },
      { src: "/brand/mantara-mark.png", sizes: "1254x1254", type: "image/png", purpose: "maskable" },
    ],
  };
}
