import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão Condominial",
    short_name: "Condomínios",
    description: "Rotina de visitas, manutenções e estoque dos seus condomínios.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#173d35",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
