import {test} from "node:test";
import assert from "node:assert/strict";
import {extractPixEndToEndId} from "./pix-identifier.mjs";
test("extrai o EndToEndId sem depender do nome do arquivo",()=>{
 const id="E60746948202610292031A5793FujebQ";
 assert.equal(extractPixEndToEndId("Comprovante de Pix\nEndToEndId: "+id+"\nValor R$ 2.000,00"),id.toUpperCase());
});
test("não inventa identificador com nome, data ou valor",()=>{
 assert.equal(extractPixEndToEndId("Pix 29/10/2026 R$ 2.000,00 ANGELINA RABELO"),"");
});
test("vários IDs em um arquivo não são associados ao documento errado",()=>{
 assert.equal(extractPixEndToEndId("Pix E60746948202610292031A5793FujebQ e E60746948202610292031A5793FujebZ"),"");
});
