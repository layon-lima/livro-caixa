import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Book={id:string;nome:string};
export async function GET(){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Não autenticado."},{status:401});
  const db=getDatabase();
  const [imports,edits]=await Promise.all(["can_import","can_edit"].map(column=>
    user.isAdmin?db.query<Book>("SELECT id::text,nome FROM titulares ORDER BY nome"):
      db.query<Book>("SELECT t.id::text,t.nome FROM titulares t JOIN user_titular_permissions p "+
        "ON p.titular_id=t.id WHERE p.user_id=$1 AND p."+column+"=TRUE ORDER BY t.nome",[user.id])
  ));
  return NextResponse.json({importBooks:imports.rows,editBooks:edits.rows},
    {headers:{"Cache-Control":"private, no-store"}});
}