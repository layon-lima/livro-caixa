import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { BookOpen } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="login-screen">
      <form className="login-form" method="post" action="/api/auth/login">
        <div className="login-brand"><BookOpen size={22} /> <strong>Livro Caixa</strong></div>
        <p className="muted login-subtitle">Organização documental</p>
        <h1>Acesso ao sistema</h1>
        <label htmlFor="username">Usuário</label>
        <input id="username" name="username" type="text" autoComplete="username" required minLength={3} maxLength={32} autoFocus />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
        {error === "1" && <p className="form-error" role="alert">Usuário ou senha inválidos.</p>}
        <button type="submit" className="primary-btn">Entrar</button>
      </form>
    </main>
  );
}
