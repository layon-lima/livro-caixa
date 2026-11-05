import type { Metadata } from "next";
import "./globals.css";
import "./ios-surface.css";
import {Suspense} from "react";
import { GlobalWorkspaceActions } from "@/components/global-workspace-actions";

export const metadata: Metadata = {
  title: "Livro Caixa Inteligente",
  description: "Organização documental por titular, competência e categoria.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" }
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }]
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}<Suspense fallback={null}><GlobalWorkspaceActions/></Suspense></body>
    </html>
  );
}
