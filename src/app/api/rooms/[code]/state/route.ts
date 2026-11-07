import { respond } from "@/lib/server/http";
import { readState } from "@/lib/server/rooms";

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Context) {
  const { code } = await params;
  return respond(() => readState(code, request.headers.get("x-player-token")));
}
