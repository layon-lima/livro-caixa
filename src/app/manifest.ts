import type {MetadataRoute} from "next";
export default function manifest():MetadataRoute.Manifest {
  return {
    id:"/",
    name:"Livro Caixa Inteligente",
    short_name:"Livro Caixa",
    description:"Organização de lançamentos e documentos.",
    start_url:"/",
    scope:"/",
    display:"standalone",
    background_color:"#eef3fc",
    theme_color:"#164c9e",
    icons:[
      {src:"/icons/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
      {src:"/icons/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"}
    ]
  };
}
