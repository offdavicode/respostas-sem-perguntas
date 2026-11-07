import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Bungee } from "next/font/google";
import "./globals.css";

const display = Bungee({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-display" });
const body = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Respostas sem Perguntas",
  description: "Revele as palavras de uma pergunta oculta e acerte a resposta antes dos seus amigos.",
};

export const viewport: Viewport = {
  themeColor: "#2f62f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
