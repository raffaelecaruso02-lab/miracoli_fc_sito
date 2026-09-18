import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Miracoli FC — Scuola Calcio e Settore Giovanile",
  description: "Appello, convocazioni e comunicazioni del Campo dei Miracoli",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Miracoli FC", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#7B1123",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
