import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Originais enviados pelo usuário: 512 px e favicon de 35 px.
const source=path.join(process.cwd(),"assets/icon-source.webp");
const favicon=path.join(process.cwd(),"assets/favicon-source.png");
const iconDir=path.join(process.cwd(),"public/icons");
const appDir=path.join(process.cwd(),"src/app");
await fs.mkdir(iconDir,{recursive:true});
const resize=(file,n)=>sharp(file).resize(n,n,{kernel:"lanczos3"}).ensureAlpha().png({compressionLevel:9}).toBuffer();
const [n512,n192,n180,n32,n16]=await Promise.all([
 resize(source,512),resize(source,192),resize(source,180),
 resize(favicon,32),resize(favicon,16)
]);
await Promise.all([
 fs.writeFile(path.join(iconDir,"icon-512.png"),n512),
 fs.writeFile(path.join(iconDir,"icon-192.png"),n192),
 fs.writeFile(path.join(iconDir,"favicon-32.png"),n32),
 fs.writeFile(path.join(iconDir,"favicon-16.png"),n16),
 fs.writeFile(path.join(appDir,"icon.png"),n32),
 fs.writeFile(path.join(appDir,"apple-icon.png"),n180)
]);
function ico(images) {
 const head=Buffer.alloc(6+16*images.length);
 head.writeUInt16LE(1,2);
 head.writeUInt16LE(images.length,4);
 let offset=head.length;
 images.forEach(({size,data},i)=>{
   const p=6+16*i;
   head[p]=size;head[p+1]=size;
   head.writeUInt16LE(1,p+4);
   head.writeUInt16LE(32,p+6);
   head.writeUInt32LE(data.length,p+8);
   head.writeUInt32LE(offset,p+12);
   offset+=data.length;
 });
 return Buffer.concat([head,...images.map(x=>x.data)]);
}
await fs.writeFile(path.join(appDir,"favicon.ico"),ico([{size:16,data:n16},{size:32,data:n32}]));
console.log("Ícones LC gerados: favicon 16/32, Apple 180, PWA 192/512.");
