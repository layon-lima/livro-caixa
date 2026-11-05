import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root));
test("Ícones oficiais estão versionados",async()=>{
 const [large,small]=await Promise.all([read("assets/icon-source.webp"),read("assets/favicon-source.png")]);
 assert.equal(large.subarray(0,4).toString(),"RIFF");
 assert.equal(large.subarray(8,12).toString(),"WEBP");
 assert.equal(small.subarray(1,4).toString(),"PNG");
});
test("Gerador entrega favicon, ícone Apple e PWA nos tamanhos corretos",async()=>{
 execFileSync(process.execPath,["scripts/generate-icons.mjs"],{cwd:new URL("../",import.meta.url)});
 for(const [file,size] of [
  ["src/app/icon.png",32],["src/app/apple-icon.png",180],
  ["public/icons/icon-192.png",192],["public/icons/icon-512.png",512],
  ["public/icons/favicon-16.png",16],["public/icons/favicon-32.png",32]
 ]){
  const data=await read(file);
  assert.equal(data.subarray(1,4).toString(),"PNG");
  assert.equal(data.readUInt32BE(16),size,file);
  assert.equal(data.readUInt32BE(20),size,file);
 }
 const ico=await read("src/app/favicon.ico");
 assert.equal(ico.readUInt16LE(2),1);
 assert.equal(ico.readUInt16LE(4),2);
});
test("Menu lateral, metadados, manifesto e Docker usam nova marca",async()=>{
 const [shell,layout,manifest,docker]=await Promise.all([
  read("src/components/explorer-shell.tsx"),
  read("src/app/layout.tsx"),
  read("src/app/manifest.ts"),
  read("Dockerfile")
 ]);
 assert.match(shell.toString(),/icons\/icon-192\.png/);
 assert.match(layout.toString(),/manifest: "\/manifest\.webmanifest"/);
 assert.match(manifest.toString(),/icon-512\.png/);
 assert.match(docker.toString(),/\/app\/public \.\/public/);
});
