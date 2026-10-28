import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Livro Caixa Inteligente",
  description: "Organização documental por titular, competência e categoria.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
