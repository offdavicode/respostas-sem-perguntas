import { readJson, respond } from "@/lib/server/http";
import { joinRoom, roomSummary } from "@/lib/server/rooms";

type Context = { params: Promise<{ code: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { code } = await params;
  return respond(() => roomSummary(code));
}

export async function POST(request: Request, { params }: Context) {
  const { code } = await params;
  return respond(async () => joinRoom(code, await readJson(request)));
}
