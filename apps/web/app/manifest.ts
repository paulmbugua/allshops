import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AllShops POS",
    short_name: "AllShops",
    description: "Qatar-first resilient point of sale",
    start_url: "/pos",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#12372a",
    icons: [],
  };
}
