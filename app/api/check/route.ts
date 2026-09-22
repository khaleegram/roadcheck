import { judge, splitMessages } from "@/lib/graph";
import { readMessages } from "@/lib/read";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Paste what reached you." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const messages = splitMessages(text);

  if (messages.length === 0 || text.length > 4000) {
    return Response.json(
      { error: "Paste the messages that actually reached you." },
      { status: 400 },
    );
  }

  const read = await readMessages(messages);
  const roads = judge(read.claims);

  return Response.json({
    roads,
    readBy: read.source,
    claims: read.claims,
  });
}
