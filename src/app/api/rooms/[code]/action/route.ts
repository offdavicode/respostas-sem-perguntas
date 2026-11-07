import type { Action } from "@/lib/game/types";
import { readJson, respond } from "@/lib/server/http";
import { performAction } from "@/lib/server/rooms";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  const { code } = await params;
  return respond(async () => {
    const action = (await readJson(request)) as unknown as Action;
    return performAction(code, request.headers.get("x-player-token"), action);
  });
}
