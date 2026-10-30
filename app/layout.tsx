import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mf | Gestão Condominial",
  description: "Gestão diária para síndicos e equipes de manutenção.",
};

export const viewport: Viewport = {
  themeColor: "#173d35",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
