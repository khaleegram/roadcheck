import { aiPublicStatus, aiText } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Developer health check — not linked from the product UI. */
export async function GET() {
  const status = aiPublicStatus();
  if (status.mode !== "live") {
    return Response.json({ ...status, probe: { ok: false, error: status.skipReason } });
  }
  const probe = await aiText({
    system: "You are a health check.",
    prompt: 'Reply with exactly the word "ok".',
    timeoutMs: 10_000,
  });
  return Response.json({
    ...status,
    probe: probe.ok
      ? { ok: probe.value.toLowerCase().includes("ok"), sample: probe.value.slice(0, 40) }
      : { ok: false, error: probe.reason },
  });
}
