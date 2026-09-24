import {
  claimFromReading,
  nextQuestion,
  readReport,
  type Turn,
} from "@/lib/reading";
import { findLocation, type Location } from "@/lib/roadcheck";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_QUESTIONS = 3;

function parseTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Turn =>
        !!item &&
        typeof item.question === "string" &&
        typeof item.answer === "string",
    )
    .slice(0, MAX_QUESTIONS)
    .map((turn) => ({
      question: turn.question.slice(0, 300),
      answer: turn.answer.trim().slice(0, 500),
    }));
}

export async function POST(request: Request) {
  let body: {
    rawText?: unknown;
    turns?: unknown;
    locations?: unknown;
    contextPlace?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a report." }, { status: 400 });
  }

  const rawText =
    typeof body.rawText === "string" ? body.rawText.trim().slice(0, 1800) : "";
  const turns = parseTurns(body.turns);
  const contextPlace =
    typeof body.contextPlace === "string" ? body.contextPlace.trim().slice(0, 120) : null;
  const known = Array.isArray(body.locations)
    ? (body.locations as Location[]).filter(
        (item) => item && typeof item.id === "string" && typeof item.name === "string",
      )
    : [];
  if (rawText.length < 8) {
    return Response.json(
      { error: "Write a little more — what happened, and where?" },
      { status: 400 },
    );
  }

  const { reading, readBy, aiNote } = await readReport({
    rawText,
    turns,
    known,
    contextPlace,
  });

  const question = nextQuestion(reading, turns);
  if (question && turns.length < MAX_QUESTIONS) {
    return Response.json({ needsFollowUp: true, question, readBy, aiNote });
  }

  const claim = claimFromReading(reading, known);
  if (!claim) {
    return Response.json(
      { error: "We still need the name of the road or area to post this." },
      { status: 422 },
    );
  }

  return Response.json({
    needsFollowUp: false,
    claim,
    placeIsBusy: findLocation(claim.locationName, known)?.busy ?? reading.placeIsBusy,
    readBy,
    aiNote,
  });
}
