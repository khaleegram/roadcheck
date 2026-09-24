import { aiJson, aiText, type AiReader } from "@/lib/ai";
import {
  acceptableAnswer,
  explainPrompt,
  explainSystem,
  sameEventSystem,
  verdictPhrase,
} from "@/lib/prompts";
import { sameEventSchema } from "@/lib/reading";
import {
  evidenceNotes,
  minutesSince,
  type ExtractedClaim,
  type Location,
  type Report,
  type RoadBelief,
} from "@/lib/roadcheck";

/** Asks the model which candidate (if any) describes the same event. */
export async function judgeSameEvent(
  claim: ExtractedClaim,
  rawText: string,
  candidates: Report[],
  now = Date.now(),
): Promise<
  | { ok: true; match: Report | null; reason: string }
  | { ok: false; reason: string }
> {
  if (!candidates.length) return { ok: true, match: null, reason: "No earlier reports nearby in time." };
  const judged = await aiJson({
    schema: sameEventSchema,
    name: "SameEvent",
    system: sameEventSystem,
    timeoutMs: 10_000,
    prompt: `NEW report (${claim.minutesAgo} min ago, ${claim.epistemicStatus}):
"""${rawText}"""
Reading: ${claim.description}${claim.whatWasSeen ? ` — ${claim.whatWasSeen}` : ""}

EXISTING reports on ${claim.locationName}:
${candidates
  .map(
    (report) =>
      `- id=${report.id} (${Math.round(minutesSince(report.occurredAt, now))} min ago, ${report.claim.epistemicStatus}): "${report.rawText.slice(0, 300)}" — ${report.claim.description}`,
  )
  .join("\n")}`,
  });
  if (!judged.ok) return { ok: false, reason: judged.reason };
  return {
    ok: true,
    match: candidates.find((report) => report.id === judged.value.matchId) ?? null,
    reason: judged.value.reason,
  };
}

/** Plain-language answer for a road; falls back to the built-in sentence. */
export async function explainBelief(
  location: Location,
  belief: RoadBelief,
): Promise<{ sentence: string; readBy: AiReader; aiNote: string | null }> {
  const phrase = verdictPhrase[belief.verdict];
  const ai = await aiText({
    system: explainSystem(phrase),
    prompt: explainPrompt({
      place: location.name,
      verdictPhrase: phrase,
      notes: evidenceNotes(belief),
    }),
  });
  if (ai.ok) {
    const sentence = ai.value.replace(/^["'“]|["'”]$/g, "").trim();
    if (acceptableAnswer(sentence, belief.verdict)) {
      return { sentence, readBy: "model", aiNote: null };
    }
    console.warn(`[roadcheck ai] explanation rejected: ${sentence}`);
  }
  return {
    sentence: belief.explanation,
    readBy: "rules",
    aiNote: ai.ok ? "Model sentence rejected by guard." : ai.reason,
  };
}
