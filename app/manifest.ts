import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RoadCheck",
    short_name: "RoadCheck",
    description: "Check if a road is safe right now. Share what you've seen.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#c45c26",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
