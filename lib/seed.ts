import type { AiReader } from "@/lib/ai";
import { judgeSameEvent } from "@/lib/answers";
import {
  claimFromReading,
  nextQuestion,
  readReport,
  type Turn,
} from "@/lib/reading";
import {
  sameEventCandidates,
  type Location,
  type Report,
  type Source,
} from "@/lib/roadcheck";
import { withStore, type Store } from "@/lib/store";

/**
 * Starter reports, filed through the same AI pipeline a real reporter goes
 * through (reading, follow-up questions, same-event check, busy/quiet tag).
 * Times are relative to when the seed runs, so re-run it before showing the app.
 */

/** Everyone starts at 2/2; anything above that is past right/wrong calls. */
const SOURCES: Source[] = [
  { id: "src-musa", name: "Musa", channel: "whatsapp", alpha: 2, beta: 2 },
  { id: "src-aisha", name: "Aisha (junction trader)", channel: "eyewitness", alpha: 4, beta: 2 },
  { id: "src-rigasa-vigilance", name: "Rigasa Vigilance", channel: "vigilante", alpha: 9, beta: 2 },
  { id: "src-halima", name: "Halima", channel: "whatsapp", alpha: 2, beta: 2 },
  { id: "src-blessing", name: "Blessing", channel: "whatsapp", alpha: 2, beta: 2 },
  { id: "src-ibrahim", name: "Ibrahim", channel: "whatsapp", alpha: 2, beta: 2 },
  { id: "src-tunde", name: "Tunde (okada rider)", channel: "eyewitness", alpha: 5, beta: 2 },
  { id: "src-grace", name: "Grace", channel: "community", alpha: 3, beta: 2 },
  { id: "src-yakubu", name: "Yakubu", channel: "eyewitness", alpha: 2, beta: 2 },
  { id: "src-emeka", name: "Emeka (bus driver)", channel: "eyewitness", alpha: 6, beta: 2 },
  { id: "src-sani", name: "Sani", channel: "eyewitness", alpha: 4, beta: 2 },
  { id: "src-kachia-vigilance", name: "Kachia Road Vigilance", channel: "vigilante", alpha: 8, beta: 2 },
];

type SeedMessage = {
  place: string;
  sourceId: string;
  text: string;
  answers?: string[];
  confirmed?: boolean;
};

/** Oldest first, as they would have arrived. */
export const SEED_MESSAGES: SeedMessage[] = [
  {
    place: "Ahmadu Bello Way",
    sourceId: "src-halima",
    text: "my cousin say dem see 3 men with guns for Ahmadu Bello Way by the roundabout, like 40 minutes ago",
  },
  {
    place: "Kaduna-Zaria Junction",
    sourceId: "src-musa",
    text: "abeg una no go junction o, my cousin say dem see some men for there",
    answers: [
      "Kaduna-Zaria junction, like 20 minutes ago, 3 men with guns on okada",
      "My cousin saw them himself, he told me on phone",
    ],
  },
  {
    place: "Kawo Bridge",
    sourceId: "src-grace",
    text: "My neighbour just called, she said there's a barricade on Kawo Bridge and cars are turning back, about 15 minutes ago",
  },
  {
    place: "Kaduna-Zaria Junction",
    sourceId: "src-aisha",
    text: "I just passed Kaduna-Zaria junction, I saw about three men with guns on motorbikes near the filling station. 10 mins ago.",
  },
  {
    place: "Kawo Bridge",
    sourceId: "src-tunde",
    text: "I dey Kawo Bridge now, men don block the road with tyres, dem dey stop vehicles. 8 minutes ago",
  },
  {
    place: "Central Market Road",
    sourceId: "src-blessing",
    text: "FORWARDED: URGENT armed men at Central Market Road lock your shops now!! share to everyone",
  },
  {
    place: "Central Market Road",
    sourceId: "src-ibrahim",
    text: "FORWARDED: URGENT armed men at Central Market Road lock your shops now!! share to everyone",
  },
  {
    place: "Kurmin Mashi farm road",
    sourceId: "src-yakubu",
    text: "I dey farm road behind Kurmin Mashi, I saw two men with cutlass hiding near the stream, 5 minutes ago",
  },
  {
    place: "Kachia Road",
    sourceId: "src-emeka",
    text: "I just turned back on Kachia Road after the toll gate. Gunmen are stopping cars and taking people into the bush. 12 minutes ago, I saw it myself",
  },
  {
    place: "Kachia Road",
    sourceId: "src-sani",
    text: "I dey Kachia Road now, I see men with guns for road dey drag passengers comot from motor, e happen like 6 minutes ago",
  },
  {
    place: "Kachia Road",
    sourceId: "src-kachia-vigilance",
    text: "We are on Kachia Road near the toll gate right now. We can see armed kidnappers still blocking the road and shooting, 4 minutes ago. Nobody should come this way.",
  },
  {
    place: "Kaduna-Zaria Junction",
    sourceId: "src-rigasa-vigilance",
    text: "Our patrol just drove through Kaduna-Zaria junction 2 minutes ago, nothing there, everything normal.",
    confirmed: true,
  },
];

export type SeedLog = {
  place: string;
  source: string;
  text: string;
  turns: Turn[];
  understood: string;
  howTheyKnow: string;
  readBy: AiReader;
  sameAs: string | null;
  sameEventBy: AiReader | null;
};

function idFor(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function buildSeed(now = Date.now()): Promise<{ store: Store; log: SeedLog[] }> {
  const locations: Location[] = [];
  const reports: Report[] = [];
  const log: SeedLog[] = [];

  for (const [index, message] of SEED_MESSAGES.entries()) {
    let turns: Turn[] = [];
    let read = await readReport({ rawText: message.text, turns, known: locations });
    for (const answer of message.answers ?? []) {
      const question = nextQuestion(read.reading, turns);
      if (!question) break;
      turns = [...turns, { question, answer }];
      read = await readReport({ rawText: message.text, turns, known: locations });
    }

    const locationId = idFor(message.place);
    if (!locations.some((location) => location.id === locationId)) {
      locations.push({ id: locationId, name: message.place, busy: read.reading.placeIsBusy });
    }
    const base =
      claimFromReading(read.reading, locations) ??
      claimFromReading({ ...read.reading, place: message.place }, locations)!;
    const claim = { ...base, locationId, locationName: message.place };

    const rawText = [message.text, ...turns.map((turn) => `${turn.question} ${turn.answer}`)].join("\n");
    const candidates = sameEventCandidates(claim, reports, now);
    let clusterId = `cluster-${now}-${index}`;
    let sameAs: string | null = null;
    let sameEventBy: AiReader | null = null;
    if (candidates.length) {
      const judged = await judgeSameEvent(claim, rawText, candidates, now);
      if (judged.ok) {
        sameEventBy = "model";
        if (judged.match) {
          clusterId = judged.match.clusterId;
          sameAs = judged.match.sourceId;
        }
      } else {
        sameEventBy = "rules";
        const identical = candidates.find(
          (report) => report.rawText.split("\n")[0] === message.text,
        );
        if (identical) {
          clusterId = identical.clusterId;
          sameAs = identical.sourceId;
        }
      }
    }

    const occurredAt = new Date(now - claim.minutesAgo * 60_000).toISOString();
    const createdAt = new Date(now - Math.max(0, claim.minutesAgo - 1) * 60_000).toISOString();
    reports.push({
      id: `r-${now - (SEED_MESSAGES.length - index) * 1000}`,
      rawText,
      sourceId: message.sourceId,
      createdAt,
      occurredAt,
      claim,
      clusterId,
      status: message.confirmed ? "confirmed" : "open",
    });

    const sourceName = (id: string | null) =>
      SOURCES.find((source) => source.id === id)?.name ?? null;
    log.push({
      place: message.place,
      source: sourceName(message.sourceId) ?? message.sourceId,
      text: message.text,
      turns,
      understood: claim.whatWasSeen || claim.description,
      howTheyKnow: claim.epistemicStatus,
      readBy: read.readBy,
      sameAs: sourceName(sameAs),
      sameEventBy,
    });
  }

  return {
    store: { locations, reports, sources: SOURCES.map((source) => ({ ...source })) },
    log,
  };
}

/** Replaces everything in the store with freshly filed starter reports. */
export async function seedStore() {
  const seeded = await buildSeed();
  await withStore((current) => {
    current.locations = seeded.store.locations;
    current.reports = seeded.store.reports;
    current.sources = seeded.store.sources;
  });
  return seeded;
}
