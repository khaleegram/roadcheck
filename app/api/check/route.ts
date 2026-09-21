import { board, routes, type RouteId } from "@/lib/board";
import { decide } from "@/lib/decide";
import { readMessage } from "@/lib/read";

export const runtime = "nodejs";
export const maxDuration = 30;

const routeIds = new Set<string>(routes.map((route) => route.id));

export async function POST(request: Request) {
  let body: { message?: unknown; route?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a message and a road." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const route = typeof body.route === "string" ? body.route : "";

  if (message.length < 8 || message.length > 1200) {
    return Response.json(
      { error: "Paste the message you actually heard — a sentence is enough." },
      { status: 400 },
    );
  }

  if (!routeIds.has(route)) {
    return Response.json({ error: "Pick the road you mean to walk." }, { status: 400 });
  }

  const extraction = await readMessage(message);
  const decision = decide(route as RouteId, extraction);

  return Response.json({
    decision,
    readBy: extraction.source,
    kind: extraction.kind,
    board,
  });
}
