import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { titularesPermitidos } from "@/lib/document-data";
import { ExplorerShell } from "@/components/explorer-shell";

// O mesmo Explorador e barra lateral usados em Livros ficam presentes
// em Administração, Lixeira, Conferência, importação e edição.
export async function StandaloneWorkspace({children,title,section="livros"}:{
  children:ReactNode;title:string;section?:"livros"|"admin"|"lixeira";
}){
  const user=await requireUser();
  const books=await titularesPermitidos(user,"view");
  return <ExplorerShell user={user} titulares={books}
    pageTitle={title} activeSection={section}>
    <div className="workspace-embedded">{children}</div>
  </ExplorerShell>;
}
