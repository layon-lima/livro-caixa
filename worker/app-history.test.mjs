import {test} from "node:test";
import assert from "node:assert/strict";
import {ROOT_HISTORY,visitPage,movePage,isInternalPath,safeHistory} from "../src/lib/app-history.ts";

test("volta regressivamente até a home e não passa dela",()=>{
  let h=visitPage(ROOT_HISTORY,"/livros/4");
  h=visitPage(h,"/operacoes/19");
  h=visitPage(h,"/conferencia?id=12");
  assert.equal(h.index,3);
  h=movePage(h,-1);
  assert.equal(h.entries[h.index],"/operacoes/19");
  h=movePage(h,-1);
  assert.equal(h.entries[h.index],"/livros/4");
  h=movePage(h,-1);
  assert.equal(h.entries[h.index],"/");
  assert.equal(movePage(h,-1),null);
  assert.equal(movePage(h,1)?.entries[1],"/livros/4");
});

test("acesso direto a uma página interna ainda permite voltar à home",()=>{
  const h=visitPage(ROOT_HISTORY,"/conferencia?lote=123");
  assert.deepEqual(h.entries,["/","/conferencia?lote=123"]);
  assert.equal(movePage(h,-1)?.entries[0],"/");
});

test("voltar e depois abrir outra pasta apaga só o caminho à frente",()=>{
  const h=visitPage(visitPage(ROOT_HISTORY,"/livros/1"),"/operacoes/7");
  const back=movePage(h,-1);
  const updated=visitPage(back,"/livros/2");
  assert.deepEqual(updated.entries,["/","/livros/1","/livros/2"]);
  assert.equal(movePage(updated,1),null);
});

test("clicar no início trava Voltar sem causar saída do app",()=>{
  const h=visitPage(ROOT_HISTORY,"/livros/1");
  const home=visitPage(h,"/");
  assert.deepEqual(home,ROOT_HISTORY);
  assert.equal(movePage(home,-1),null);
});

test("navegação do navegador reconhece as páginas vizinhas",()=>{
  const h=visitPage(visitPage(ROOT_HISTORY,"/livros/1"),"/operacoes/2");
  const prev=visitPage(h,"/livros/1",true);
  assert.equal(prev.index,1);
  assert.equal(visitPage(prev,"/operacoes/2",true).index,2);
  const home=visitPage(prev,"/",true);
  assert.equal(home.index,0);
  assert.equal(movePage(home,1)?.entries[1],"/livros/1");
});

test("histórico persistido rejeita rotas externas e estados inválidos",()=>{
  assert.equal(isInternalPath("//external.example"),false);
  assert.equal(isInternalPath("/\\external.example"),false);
  assert.equal(isInternalPath("javascript:alert(1)"),false);
  assert.deepEqual(safeHistory({entries:["//attacker","/livros/1"],index:0}).entries,["/","/livros/1"]);
});
