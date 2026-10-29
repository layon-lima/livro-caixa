import type { Metadata } from "next";
import "./globals.css";
import { GlobalWorkspaceActions } from "@/components/global-workspace-actions";

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
      <body>{children}<GlobalWorkspaceActions/></body>
    </html>
  );
}
