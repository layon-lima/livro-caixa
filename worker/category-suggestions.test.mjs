import {test} from "node:test";
import assert from "node:assert/strict";
import {bestCategory,splitSuggestion} from "./category-suggestions.mjs";
const cats=[{id:"10",nome:"Compras Fazenda"},{id:"11",nome:"Abastecimento"}];
test("Categoria já cadastrada reaproveita id",()=>{
  assert.equal(bestCategory("compras fazenda",cats).existing.id,"10");
});
test("Categoria nova da IA não é cadastrada automaticamente",()=>{
  assert.deepEqual(bestCategory("Pneus",cats),{existing:null,suggested:null});
});
test("Não aceita subcategoria nem categoria antiga",()=>{
  assert.equal(splitSuggestion("Manutenção > Peças"),null);
  assert.equal(splitSuggestion("Compras Fazenda → Insumos"),null);
  assert.deepEqual(bestCategory("Combustíveis > Diesel",cats),{existing:null,suggested:null});
  assert.equal(splitSuggestion("Abastecimento").nome,"Abastecimento");
});
