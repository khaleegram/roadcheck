import {
  assignCluster,
  calculateRoadBelief,
  initialReports,
  initialSources,
  updateSourceOutcome,
  type Report,
} from "../lib/roadcheck";

function expect(value: boolean, message: string) {
  if (!value) throw new Error(message);
  console.log(`ok · ${message}`);
}

const market = calculateRoadBelief(
  "market-road",
  initialReports,
  initialSources,
);
expect(
  market.verdict === "caution" || market.verdict === "avoid",
  "independent eyewitness plus rumour chain raises Market Road",
);
expect(
  market.independentChains === 2,
  "two WhatsApp forwards count as one chain",
);

const duplicateClaim = {
  ...initialReports[0].claim,
  description: "Armed men reported at Market Road north junction",
  minutesAgo: 24,
};
expect(
  assignCluster(duplicateClaim, initialReports) === "cluster-north-junction",
  "a copied voice note joins its original chain",
);

const contradiction: Report = {
  id: "r-contradiction",
  rawText: "I drove Market Road two minutes ago. It was clear.",
  sourceId: "src-patrol",
  createdAt: "6:38 PM",
  claim: {
    roadId: "market-road",
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

const afterContradiction = calculateRoadBelief(
  "market-road",
  [...initialReports, contradiction],
  initialSources,
);
expect(
  afterContradiction.probability < market.probability,
  "a credible direct contradiction after the warning collapses belief",
);

const source = initialSources[0];
const confirmed = updateSourceOutcome(source, "confirmed");
const refuted = updateSourceOutcome(source, "refuted");
expect(
  confirmed.alpha === source.alpha + 1 && confirmed.beta === source.beta,
  "confirmation improves the source ledger",
);
expect(
  refuted.beta === source.beta + 1 && refuted.alpha === source.alpha,
  "refutation reduces the source ledger",
);

const loneRumour = calculateRoadBelief(
  "market-road",
  [initialReports[0]],
  initialSources,
);
expect(
  loneRumour.evidence.some((line) => line.reportId === "absence"),
  "missing corroboration on a busy road is negative evidence",
);
