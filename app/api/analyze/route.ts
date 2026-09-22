import { generateText, Output } from "ai";
import { z } from "zod";
import {
  roads,
  type EpistemicStatus,
  type EventType,
  type ExtractedClaim,
  type RoadId,
  type Severity,
} from "@/lib/roadcheck";

export const runtime = "nodejs";
export const maxDuration = 30;

const extractionSchema = z.object({
  roadId: z.enum(["market-road", "river-path", "hill-cut"]).nullable(),
  eventType: z.enum([
    "armed_people",
    "road_block",
    "movement",
    "violence",
    "all_clear",
    "unknown",
  ]),
  direction: z.enum(["danger", "clear"]),
  description: z.string(),
  epistemicStatus: z.enum([
    "firsthand",
    "secondhand",
    "thirdhand",
    "unknown",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  minutesAgo: z.number().nullable(),
  extractionConfidence: z.number().min(0).max(1),
  reportedBy: z.string(),
  originHint: z.string().nullable(),
  missing: z.array(z.enum(["road", "time", "source"])),
  followUp: z.string().nullable(),
});

const modelId = process.env.ROADCHECK_MODEL ?? "openai/gpt-5.4-mini";

function roadFromText(text: string): RoadId | null {
  const value = text.toLowerCase();
  if (/market|north junction|junction/.test(value)) return "market-road";
  if (/river|bridge/.test(value)) return "river-path";
  if (/hill|mill/.test(value)) return "hill-cut";
  return null;
}

function timeFromText(text: string) {
  const number = text.match(/(\d+)\s*(?:minutes?|mins?)\s*ago/i);
  if (number) return Number(number[1]);
  if (/just now|right now|now\b/i.test(text)) return 1;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    five: 5,
    eight: 8,
    ten: 10,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
    thirty: 30,
    forty: 40,
  };
  const named = text
    .toLowerCase()
    .match(
      /\b(one|two|five|eight|ten|twelve|fifteen|twenty|thirty|forty)\s+minutes?\s+ago/,
    );
  return named ? words[named[1]] : null;
}

function fallbackExtract(rawText: string, answer: string | null) {
  const full = `${rawText}\n${answer ?? ""}`.trim();
  const value = full.toLowerCase();
  const roadId = roadFromText(full);
  const minutesAgo = timeFromText(full);
  const firsthand =
    /\bi saw\b|\bi am at\b|\bi'm at\b|\bi drove\b|\bi walked\b|\bwe saw\b|\bwe walked\b/.test(
      value,
    );
  const thirdhand = /forwarded|forward\b|group says|people are saying/.test(value);
  const secondhand =
    /cousin|someone said|heard that|told me|voice note|says that/.test(value);
  const clear = /clear|empty|nothing unusual|safe|no one there|all quiet/.test(value);
  const armed = /armed|gun|rifle|long object/.test(value);
  const violence = /shoot|attack|fight|explosion/.test(value);
  const roadBlock = /block|barricade|stopped vehicles/.test(value);
  const movement = /movement|moving|men|people|motorbike/.test(value);

  let epistemicStatus: EpistemicStatus = "unknown";
  if (firsthand) epistemicStatus = "firsthand";
  else if (thirdhand) epistemicStatus = "thirdhand";
  else if (secondhand) epistemicStatus = "secondhand";

  let eventType: EventType = "unknown";
  if (clear) eventType = "all_clear";
  else if (violence) eventType = "violence";
  else if (armed) eventType = "armed_people";
  else if (roadBlock) eventType = "road_block";
  else if (movement) eventType = "movement";

  const severity: Severity =
    armed || violence ? "high" : roadBlock || movement ? "medium" : "low";
  const missing: Array<"road" | "time" | "source"> = [];
  if (!roadId) missing.push("road");
  if (minutesAgo == null) missing.push("time");
  if (epistemicStatus === "unknown") missing.push("source");

  const followUp =
    missing.length === 0
      ? null
      : missing.includes("source")
        ? "Did you see this yourself, or did someone tell you?"
        : missing.includes("road")
          ? "Which road was this on: Market Road, River Path, or Hill Cut?"
          : "When did this happen — roughly how many minutes ago?";

  const reporter =
    full.match(
      /\b(?:my\s+)?(cousin|brother|sister|neighbou?r|friend|patrol|vigilante)\b/i,
    )?.[1] ?? (firsthand ? "Reporter" : "Unknown source");

  return {
    roadId,
    eventType,
    direction: clear ? ("clear" as const) : ("danger" as const),
    description: clear
      ? "Road reported clear after a direct check"
      : armed
        ? "Armed people reported on or near the road"
        : roadBlock
          ? "Road obstruction reported"
          : movement
            ? "Unusual movement reported"
            : "Unspecified safety report",
    epistemicStatus,
    severity,
    minutesAgo,
    extractionConfidence:
      missing.length === 0 ? 0.82 : Math.max(0.42, 0.72 - missing.length * 0.1),
    reportedBy: reporter.charAt(0).toUpperCase() + reporter.slice(1),
    originHint:
      thirdhand || secondhand
        ? full
            .match(/(?:voice note|forward(?:ed)?|message)/i)?.[0]
            ?.toLowerCase() ?? null
        : null,
    missing,
    followUp,
  };
}

async function extract(rawText: string, answer: string | null) {
  if (process.env.ROADCHECK_REHEARSAL === "1") {
    return { result: fallbackExtract(rawText, answer), readBy: "rules" as const };
  }

  try {
    const { output } = await generateText({
      model: modelId,
      output: Output.object({
        schema: extractionSchema,
        name: "RoadSafetyClaim",
      }),
      abortSignal: AbortSignal.timeout(20_000),
      system: `You are the language-reading layer of a road-safety report system. Extract claims; never decide whether a road is safe.

Known roads:
${roads.map((road) => `- ${road.id}: ${road.name} (${road.detail})`).join("\n")}

Rules:
- firsthand means the reporter personally saw it or personally passed through.
- secondhand means a named person told the reporter.
- thirdhand means an unattributed forward/group repost.
- originHint should identify the named voice note, forward, or original story when possible; copied versions must receive the same short hint.
- all-clear requires someone to have physically checked/passed the road. "It looks quiet from here" is not all-clear.
- Never invent road, time, witness, or detail.
- If road, time, or source status is missing, put it in missing and ask exactly one short question that removes the most important uncertainty.
- If a follow-up answer is supplied, combine it with the original report.
- description is one calm factual sentence, not advice.`,
      prompt: `Original report:\n${rawText}${
        answer ? `\n\nReporter answered the follow-up:\n${answer}` : ""
      }`,
    });
    if (!output) throw new Error("No extraction returned");
    return { result: output, readBy: "model" as const };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error(`AI extraction failed, using transparent fallback: ${detail}`);
    return { result: fallbackExtract(rawText, answer), readBy: "rules" as const };
  }
}

export async function POST(request: Request) {
  let body: { rawText?: unknown; answer?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a report." }, { status: 400 });
  }

  const rawText =
    typeof body.rawText === "string" ? body.rawText.trim().slice(0, 1800) : "";
  const answer =
    typeof body.answer === "string" ? body.answer.trim().slice(0, 500) : null;
  if (rawText.length < 8) {
    return Response.json(
      { error: "Enter the report as it reached you." },
      { status: 400 },
    );
  }

  const { result, readBy } = await extract(rawText, answer);

  if (result.followUp && !answer) {
    return Response.json({
      needsFollowUp: true,
      question: result.followUp,
      preview: result,
      readBy,
    });
  }

  const roadId = result.roadId ?? roadFromText(answer ?? "") ?? "market-road";
  const claim: ExtractedClaim = {
    roadId,
    eventType: result.eventType as EventType,
    direction: result.direction,
    description: result.description,
    epistemicStatus: result.epistemicStatus as EpistemicStatus,
    severity: result.severity as Severity,
    minutesAgo: result.minutesAgo ?? timeFromText(answer ?? "") ?? 15,
    extractionConfidence: result.extractionConfidence,
    reportedBy: result.reportedBy,
    originHint: result.originHint,
  };

  return Response.json({
    needsFollowUp: false,
    claim,
    readBy,
  });
}
