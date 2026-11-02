import {test} from "node:test";
import assert from "node:assert/strict";
import {eachZipDocument} from "../src/lib/zip-documents.ts";

// ZIPs pequenos de teste com 3 membros (PDF, XML, TXT) e um nome inseguro.
const valid="UEsDBBQAAAAIAKloYl2ujg4OEAAAAA4AAAAaAAAAZG9jdW1lbnRvcy9Db21wcm92YW50ZS5wZGZTDXBx0zXUM+FSVXX1dwMAUEsDBBQAAAAIAKloYl10o0+8EAAAABEAAAAWAAAAZG9jdW1lbnRvcy9ub3RpbmhhLnhtbLPxc0u1s8lMSdW3s9EHsQFQSwMEFAAAAAgAqWhiXRsxbEYJAAAABwAAABMAAABkb2N1bWVudG9zL2xlaWEudHh0y0zPyy9KLAIAUEsBAhQDFAAAAAgAqWhiXa6ODg4QAAAADgAAABoAAAAAAAAAAAAAAIABAAAAAGRvY3VtZW50b3MvQ29tcHJvdmFudGUucGRmUEsBAhQDFAAAAAgAqWhiXXSjT7wQAAAAEQAAABYAAAAAAAAAAAAAAIABSAAAAGRvY3VtZW50b3Mvbm90aW5oYS54bWxQSwECFAMUAAAACACpaGJdGzFsRgkAAAAHAAAAEwAAAAAAAAAAAAAAgAGMAAAAZG9jdW1lbnRvcy9sZWlhLnR4dFBLBQYAAAAAAwADAM0AAADGAAAAAAA=";
const unsafe="UEsDBBQAAAAIAKloYl2ujg4OEAAAAA4AAAAOAAAALi4vYXJxdWl2by5wZGZTDXBx0zXUM+FSVXX1dwMAUEsBAhQDFAAAAAgAqWhiXa6ODg4QAAAADgAAAA4AAAAAAAAAAAAAAIABAAAAAC4uL2FycXVpdm8ucGRmUEsFBgAAAAABAAEAPAAAADwAAAAAAA==";

test("ZIP: importa documentos um por vez, em ordem, e ignora formatos estranhos",async()=>{
  const found=[],skipped=[];
  await eachZipDocument(Buffer.from(valid,"base64"),
    async(name,content)=>{found.push([name,content.toString("utf8")]);},
    async(name,reason)=>{skipped.push([name,reason]);});
  assert.deepEqual(found,[
    ["Comprovante.pdf","%PDF-1.4\n%%EOF"],
    ["notinha.xml","<NFe><ide/></NFe>"]
  ]);
  assert.equal(skipped.length,1);
  assert.equal(skipped[0][0],"leia.txt");
});
test("ZIP com path traversal é recusado sem gravar arquivos",async()=>{
  await assert.rejects(eachZipDocument(Buffer.from(unsafe,"base64"),
    async()=>{},async()=>{}),/caminhos inválidos/);
});
test("ZIP inválido é recusado",async()=>{
  await assert.rejects(eachZipDocument(Buffer.from("nao e zip"),async()=>{},async()=>{}));
});
