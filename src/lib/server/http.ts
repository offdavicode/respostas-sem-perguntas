import { NextResponse } from "next/server";
import { GameError, KickedError } from "@/lib/game/engine";

export async function respond<T>(work: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await work(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof KickedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof GameError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Algo deu errado. Tente de novo." }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
