import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AllShops POS + ERP",
    short_name: "AllShops",
    description: "Kenya-ready POS and ERP for modern businesses",
    start_url: "/pos",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#12372a",
    icons: [],
  };
}
