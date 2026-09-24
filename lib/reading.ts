import { z } from "zod";
import { aiJson, type AiReader } from "@/lib/ai";
import { extractionPrompt, extractionSystem } from "@/lib/prompts";
import {
  findLocation,
  locationIdFromName,
  type EpistemicStatus,
  type EventType,
  type ExtractedClaim,
  type Location,
} from "@/lib/roadcheck";

export const readingSchema = z.object({
  place: z.string().nullable().catch(null),
  placeIsBusy: z.boolean().catch(true),
  eventType: z
    .enum(["armed_people", "road_block", "movement", "violence", "all_clear", "unknown"])
    .catch("unknown"),
  direction: z.enum(["danger", "clear"]).catch("danger"),
  whatWasSeen: z.string().nullable().catch(null),
  timeReference: z.string().nullable().catch(null),
  minutesAgo: z.number().nullable().catch(null),
  howTheyKnow: z.enum(["firsthand", "secondhand", "thirdhand", "unknown"]).catch("unknown"),
  reporterRelationship: z.string().nullable().catch(null),
  originHint: z.string().nullable().catch(null),
  severity: z.enum(["low", "medium", "high"]).catch("medium"),
  confidence: z.number().min(0).max(1).catch(0.6),
  summary: z.string().catch("Safety report"),
  unclear: z.array(z.string()).catch([]),
  question: z.string().nullable().catch(null),
});

export type Reading = z.infer<typeof readingSchema>;
export type Turn = { question: string; answer: string };

export const sameEventSchema = z.object({
  matchId: z.string().nullable().catch(null),
  reason: z.string().catch(""),
});

export const ASK_PLACE = "Which road or area is this? Use the name people there call it.";

function placeFromText(text: string, known: Location[]) {
  for (const location of known) {
    if (text.toLowerCase().includes(location.name.toLowerCase())) {
      return location.name;
    }
  }
  const suffix =
    "(?:Road|Rd|Street|St|Avenue|Ave|Junction|Bridge|Path|Way|Expressway|Bypass|Market|Roundabout|Park)";
  const titled = text.match(
    new RegExp(`\\b((?:[A-Z][\\w'’-]*[\\s-]+){1,4}${suffix})\\b`),
  );
  if (titled) return titled[1].trim();
  const loose = text.match(
    new RegExp(`\\b((?:[\\w'’-]+\\s+){0,2}${suffix.toLowerCase()})\\b`, "i"),
  );
  if (loose) {
    const words = loose[1].trim().split(/\s+/);
    const stop = /^(i|we|they|he|she|just|the|at|on|for|near|by|to|along|with|guns?|men|dey|see)$/i;
    while (words.length > 1 && stop.test(words[0])) words.shift();
    return words.join(" ");
  }
  const hinted = text.match(
    /(?:on|at|near|along|for)\s+([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,5})/,
  );
  return hinted?.[1]?.trim() || null;
}

export function minutesFromText(text: string) {
  const number = text.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (number) return Number(number[1]);
  const hours = text.match(/(\d+)\s*(?:hours?|hrs?)\b/i);
  if (hours) return Number(hours[1]) * 60;
  if (/just now|right now|\bnow\b|dey there now/i.test(text)) return 1;
  const words: Record<string, number> = {
    one: 1, two: 2, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
  };
  const named = text
    .toLowerCase()
    .match(/\b(one|two|five|ten|fifteen|twenty|thirty)\s+min/);
  return named ? words[named[1]] : null;
}

/** Keyword reader used when the model is unavailable. Same shape as the model. */
export function ruleReading(rawText: string, turns: Turn[], known: Location[]): Reading {
  const full = [rawText, ...turns.map((turn) => turn.answer)].join("\n");
  const value = full.toLowerCase();
  const place = placeFromText(full, known);
  const minutesAgo = minutesFromText(full);
  const firsthand =
    /\bi (?:just )?(?:saw|drove|walked|passed|came from)\b|\bi (?:am|'m) at\b|\bwe (?:just )?(?:saw|passed|drove)\b|\bi dey\b|\bi see am\b|\bmyself\b|\bour patrol\b/.test(value);
  const thirdhand = /forward|group says|people are saying|dem dey talk|broadcast/.test(value);
  const secondhand = /cousin|brother|sister|friend|neighbou?r|someone said|heard|told me|voice note|says that/.test(value);
  const clear = /\bclear\b|empty|nothing unusual|\bsafe\b|no one there|all quiet|calm|normal/.test(value);
  const armed = /armed|\bgun|rifle|long object|cutlass|machete/.test(value);
  const violence = /shoot|attack|fight|explosion|kidnap/.test(value);
  const roadBlock = /block|barricade|stopped vehicles|checkpoint/.test(value);
  const movement = /movement|moving|men\b|people|motorbike|okada/.test(value);

  const howTheyKnow: EpistemicStatus = firsthand
    ? "firsthand"
    : thirdhand
      ? "thirdhand"
      : secondhand
        ? "secondhand"
        : "unknown";
  const eventType: EventType = clear
    ? "all_clear"
    : violence
      ? "violence"
      : armed
        ? "armed_people"
        : roadBlock
          ? "road_block"
          : movement
            ? "movement"
            : "unknown";

  const unclear: string[] = [];
  if (!place) unclear.push("place");
  if (howTheyKnow === "unknown") unclear.push("how they know");
  if (minutesAgo == null) unclear.push("time");
  if (!clear && eventType === "unknown") unclear.push("what was seen");

  const questions: Record<string, string> = {
    place: ASK_PLACE,
    "how they know": "Did you see this yourself, or did someone tell you?",
    time: "About how long ago was this?",
    "what was seen": "What exactly was there — how many people, and were they armed?",
  };
  const asked = new Set(turns.map((turn) => turn.question));
  const next = unclear.map((key) => questions[key]).find((q) => !asked.has(q));

  return {
    place,
    placeIsBusy: !/farm|bush|path|track|village|behind|back ?street/i.test(`${place ?? ""} ${full}`),
    eventType,
    direction: clear ? "clear" : "danger",
    whatWasSeen: null,
    timeReference: minutesAgo != null ? `${minutesAgo} minutes ago` : null,
    minutesAgo,
    howTheyKnow,
    reporterRelationship: null,
    originHint: thirdhand || /voice note/.test(value) ? "forwarded message" : null,
    severity: armed || violence ? "high" : roadBlock || movement ? "medium" : "low",
    confidence: Math.max(0.4, 0.8 - unclear.length * 0.1),
    summary: clear
      ? "Road reported clear by someone who passed"
      : armed
        ? "Armed people reported on or near the road"
        : violence
          ? "Violence reported on or near the road"
          : roadBlock
            ? "Road blocked or obstructed"
            : movement
              ? "Unusual movement reported"
              : "Safety concern reported",
    unclear,
    question: next ?? null,
  };
}

/** Reads a report with the model, falling back to keyword rules. */
export async function readReport(input: {
  rawText: string;
  turns: Turn[];
  known: Location[];
  contextPlace?: string | null;
}): Promise<{ reading: Reading; readBy: AiReader; aiNote: string | null }> {
  const ai = await aiJson({
    schema: readingSchema,
    name: "RoadReport",
    system: extractionSystem(input.known.map((item) => item.name)),
    prompt: extractionPrompt(input.rawText, input.turns, input.contextPlace),
  });
  const reading = ai.ok ? ai.value : ruleReading(input.rawText, input.turns, input.known);
  if (!reading.place && input.contextPlace) reading.place = input.contextPlace;
  return {
    reading,
    readBy: ai.ok ? "model" : "rules",
    aiNote: ai.ok ? null : ai.reason,
  };
}

/** The next follow-up question to ask, or null when the report is usable. */
export function nextQuestion(reading: Reading, turns: Turn[]) {
  const asked = new Set(turns.map((turn) => turn.question.toLowerCase()));
  const question =
    reading.question && !asked.has(reading.question.toLowerCase())
      ? reading.question
      : null;
  if (question) return question;
  if (!reading.place?.trim() && !asked.has(ASK_PLACE.toLowerCase())) return ASK_PLACE;
  return null;
}

export function claimFromReading(reading: Reading, known: Location[]): ExtractedClaim | null {
  const placeName = reading.place?.trim();
  if (!placeName) return null;
  const matched = findLocation(placeName, known);
  return {
    locationId: matched?.id ?? locationIdFromName(placeName),
    locationName: matched?.name ?? placeName,
    eventType: reading.eventType,
    direction: reading.direction,
    description: reading.summary,
    epistemicStatus: reading.howTheyKnow,
    severity: reading.severity,
    minutesAgo: Math.max(0, Math.round(reading.minutesAgo ?? 15)),
    extractionConfidence: reading.confidence,
    reportedBy: reading.reporterRelationship ?? "Reporter",
    originHint: reading.originHint,
    whatWasSeen: reading.whatWasSeen,
    timeReference: reading.timeReference,
    reporterRelationship: reading.reporterRelationship,
  };
}
