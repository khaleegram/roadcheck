import {
  assignCluster,
  calculateRoadBelief,
  isCoordinatedCluster,
  matchExistingSource,
  updateSourceOutcome,
  type Location,
  type Report,
  type Source,
} from "../lib/roadcheck";

function expect(value: boolean, message: string) {
  if (!value) throw new Error(message);
  console.log(`ok · ${message}`);
}

const now = Date.parse("2026-09-22T18:40:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const market: Location = { id: "market-road", name: "Market Road", busy: true };
const river: Location = { id: "river-path", name: "River Path", busy: false };

const sources: Source[] = [
  { id: "src-whatsapp-a", name: "Forward A", channel: "whatsapp", alpha: 2, beta: 2 },
  { id: "src-whatsapp-b", name: "Forward B", channel: "whatsapp", alpha: 2, beta: 2 },
  { id: "src-witness", name: "Witness", channel: "eyewitness", alpha: 4, beta: 1 },
  { id: "src-patrol", name: "Community patrol", channel: "vigilante", alpha: 6, beta: 1 },
];

const rumour: Report = {
  id: "r1",
  rawText: "Forwarded voice note: armed men at the north junction on Market Road.",
  sourceId: "src-whatsapp-a",
  createdAt: ago(30),
  occurredAt: ago(30),
  claim: {
    locationId: "market-road",
    locationName: "Market Road",
    eventType: "armed_people",
    direction: "danger",
    description: "Armed men reported at the north junction",
    epistemicStatus: "secondhand",
    severity: "high",
    minutesAgo: 30,
    extractionConfidence: 0.91,
    reportedBy: "Relative",
    originHint: "north-junction-voice-note",
  },
  clusterId: "cluster-north-junction",
  status: "open",
};

const copy: Report = {
  ...rumour,
  id: "r2",
  sourceId: "src-whatsapp-b",
  createdAt: ago(27),
  occurredAt: ago(27),
  claim: {
    ...rumour.claim,
    epistemicStatus: "thirdhand",
    minutesAgo: 27,
    extractionConfidence: 0.87,
    reportedBy: "Group",
  },
};

const witness: Report = {
  id: "r3",
  rawText: "I saw two men carrying long objects move from the junction toward Market Road.",
  sourceId: "src-witness",
  createdAt: ago(12),
  occurredAt: ago(12),
  claim: {
    locationId: "market-road",
    locationName: "Market Road",
    eventType: "movement",
    direction: "danger",
    description: "Two men with long objects moving from the junction",
    epistemicStatus: "firsthand",
    severity: "high",
    minutesAgo: 12,
    extractionConfidence: 0.96,
    reportedBy: "Witness",
    originHint: null,
  },
  clusterId: "cluster-witness",
  status: "open",
};

const riverClear: Report = {
  id: "r4",
  rawText: "Our patrol walked River Path. It was empty.",
  sourceId: "src-patrol",
  createdAt: ago(8),
  occurredAt: ago(8),
  claim: {
    locationId: "river-path",
    locationName: "River Path",
    eventType: "all_clear",
    direction: "clear",
    description: "Patrol walked the full path and found it empty",
    epistemicStatus: "firsthand",
    severity: "medium",
    minutesAgo: 8,
    extractionConfidence: 0.98,
    reportedBy: "Community patrol",
    originHint: null,
  },
  clusterId: "cluster-river",
  status: "confirmed",
};

const reports = [rumour, copy, witness, riverClear];

const marketBelief = calculateRoadBelief(market, reports, sources, now);
expect(
  marketBelief.verdict === "caution" || marketBelief.verdict === "avoid",
  "independent eyewitness plus rumour chain raises a busy road",
);
expect(marketBelief.independentChains === 2, "two forwards count as one chain");

expect(
  assignCluster(
    { ...rumour.claim, description: "Armed men reported at Market Road north junction", minutesAgo: 24 },
    reports,
  ) === "cluster-north-junction",
  "a copied voice note joins its original chain",
);

const contradiction: Report = {
  id: "r-clear",
  rawText: "I drove Market Road two minutes ago. It was clear.",
  sourceId: "src-patrol",
  createdAt: ago(2),
  occurredAt: ago(2),
  claim: {
    locationId: "market-road",
    locationName: "Market Road",
    eventType: "all_clear",
    direction: "clear",
    description: "A trusted patrol drove the full road and found it clear",
    epistemicStatus: "firsthand",
    severity: "medium",
    minutesAgo: 2,
    extractionConfidence: 0.98,
    reportedBy: "Community patrol",
    originHint: null,
  },
  clusterId: "cluster-recent-clear",
  status: "confirmed",
};

const after = calculateRoadBelief(market, [...reports, contradiction], sources, now);
expect(after.probability < marketBelief.probability, "a credible contradiction collapses belief");
expect(
  after.evidence.some((line) => line.label === "Recent credible contradiction"),
  "the evidence trace names the contradiction",
);

const confirmed = updateSourceOutcome(sources[0], "confirmed");
const refuted = updateSourceOutcome(sources[0], "refuted");
expect(confirmed.alpha === 3 && confirmed.beta === 2, "confirmation improves the source ledger");
expect(refuted.beta === 3 && refuted.alpha === 2, "refutation reduces the source ledger");

const lone = calculateRoadBelief(market, [rumour], sources, now);
expect(lone.verdict === "unconfirmed", "one secondhand rumour stays unconfirmed");
expect(
  lone.evidence.some((line) => line.reportId === "absence"),
  "missing corroboration on a busy road is negative evidence",
);

const sybilA: Report = {
  ...rumour,
  id: "s1",
  rawText: "URGENT armed men at market junction lock up now armed men at market junction",
  claim: {
    ...rumour.claim,
    originHint: null,
    epistemicStatus: "thirdhand",
    minutesAgo: 22,
    description: "Armed men at the market junction, lock up now",
  },
  occurredAt: ago(22),
  clusterId: "cluster-sybil",
};
const sybilB: Report = {
  ...sybilA,
  id: "s2",
  sourceId: "src-whatsapp-b",
  occurredAt: ago(21),
  claim: { ...sybilA.claim, minutesAgo: 21 },
};
expect(isCoordinatedCluster([sybilA, sybilB], sources), "near-identical cold-start rumours are coordinated");
const sybilBelief = calculateRoadBelief(market, [sybilA, sybilB], sources, now);
expect(sybilBelief.independentChains === 1, "coordinated rumours remain one chain");

const empty = calculateRoadBelief(market, [], sources, now);
expect(empty.verdict === "unconfirmed", "no reports is uncertainty, not proof of safety");

expect(
  matchExistingSource("Community patrol", sources)?.id === "src-patrol",
  "a handle reuses the existing source ledger",
);

const riverBelief = calculateRoadBelief(river, reports, sources, now);
expect(riverBelief.verdict === "looks-clear", "a confirmed firsthand all-clear stays calm");

const jargon =
  /\b(chains?|clusters?|cold-?start|corroborat\w*|epistemic|log-?odds|ledger|probability|firsthand|secondhand|thirdhand)\b|%/i;
for (const b of [marketBelief, after, lone, sybilBelief, empty, riverBelief]) {
  expect(!jargon.test(b.explanation), `plain answer has no jargon: "${b.explanation}"`);
  for (const line of b.evidence) {
    expect(!jargon.test(line.plain), `plain evidence has no jargon: "${line.plain}"`);
  }
}

console.log("engine checks passed");
