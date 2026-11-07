import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Respostas sem Perguntas",
    short_name: "Respostas",
    description: "Revele as palavras de uma pergunta oculta e acerte a resposta antes dos seus amigos.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#2f62f5",
    theme_color: "#2f62f5",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
