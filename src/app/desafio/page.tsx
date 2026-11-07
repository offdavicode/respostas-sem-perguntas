import type { Metadata } from "next";
import { Daily } from "@/components/Daily";

export const metadata: Metadata = { title: "Pergunta do dia | Respostas sem Perguntas" };

export default function DailyPage() {
  return <Daily />;
}
