import type { Metadata } from "next";
import { RoomGate } from "@/components/RoomGate";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Sala | Respostas sem Perguntas" };

export const instant = false;

export default async function RoomPage({ params }: Props) {
  const { code } = await params;
  return <RoomGate code={code.toUpperCase()} />;
}
