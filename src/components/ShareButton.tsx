"use client";

import { useState } from "react";
import { type ResultImage, shareResult } from "@/lib/client/shareImage";

type Props = {
  image: ResultImage;
  text: string;
  filename: string;
};

export function ShareButton({ image, text, filename }: Props) {
  const [status, setStatus] = useState<"idle" | "busy" | "downloaded" | "error">("idle");

  async function share() {
    setStatus("busy");
    try {
      const outcome = await shareResult(image, text, filename);
      setStatus(outcome === "downloaded" ? "downloaded" : "idle");
    } catch {
      setStatus("error");
    }
  }

  const labels = {
    idle: "Compartilhar resultado",
    busy: "Gerando imagem...",
    downloaded: "Imagem baixada",
    error: "Não foi possível gerar",
  };

  return (
    <button
      type="button"
      className="button block block-yellow"
      disabled={status === "busy"}
      onClick={share}
    >
      {labels[status]}
    </button>
  );
}
