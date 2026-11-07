import { readJson, respond } from "@/lib/server/http";
import { openRoom } from "@/lib/server/rooms";

export async function POST(request: Request) {
  return respond(async () => openRoom(await readJson(request)));
}
