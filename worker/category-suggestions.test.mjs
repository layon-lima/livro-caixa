import { test } from "node:test";
import assert from "node:assert/strict";
import { bestCategory, splitSuggestion } from "./category-suggestions.mjs";

const categories=[
  {id:"10",nome:"Manutenção",subcategoria:"Peças"},
  {id:"11",nome:"Outras despesas",subcategoria:""}
];
test("IA pode sugerir grupo e subcategoria ainda não cadastrados",()=>{
  const suggestion=bestCategory("Veículos > Pneus",categories);
  assert.equal(suggestion.existing,null);
  assert.deepEqual(suggestion.suggested,{nome:"Veículos",subcategoria:"Pneus"});
});
test("Categorias equivalentes reaproveitam id cadastrado",()=>{
  const result=bestCategory("MANUTENCAO > PECAS",categories);
  assert.equal(result.existing.id,"10");
  assert.equal(result.suggested,null);
});
test("Outras despesas não vira sugestão automática",()=>{
  assert.deepEqual(bestCategory("Outras despesas",categories),{existing:null,suggested:null});
});
test("Categorias de nome simples são aceitas; dados malformados são rejeitados",()=>{
  assert.deepEqual(splitSuggestion("Pneus"),{nome:"Pneus",subcategoria:""});
  assert.equal(splitSuggestion("Teste > Sub > Outra"),null);
});
