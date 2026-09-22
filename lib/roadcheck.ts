export type RoadId = "market-road" | "river-path" | "hill-cut";
export type EventType =
  | "armed_people"
  | "road_block"
  | "movement"
  | "violence"
  | "all_clear"
  | "unknown";
export type EpistemicStatus =
  | "firsthand"
  | "secondhand"
  | "thirdhand"
  | "unknown";
export type Severity = "low" | "medium" | "high";
export type ClaimDirection = "danger" | "clear";
export type ReportStatus = "open" | "confirmed" | "refuted";

export type Source = {
  id: string;
  name: string;
  channel: "eyewitness" | "whatsapp" | "community" | "vigilante";
  alpha: number;
  beta: number;
};

export type ExtractedClaim = {
  roadId: RoadId;
  eventType: EventType;
  direction: ClaimDirection;
  description: string;
  epistemicStatus: EpistemicStatus;
  severity: Severity;
  minutesAgo: number;
  extractionConfidence: number;
  reportedBy: string;
  originHint: string | null;
};

export type Report = {
  id: string;
  rawText: string;
  sourceId: string;
  createdAt: string;
  claim: ExtractedClaim;
  clusterId: string;
  status: ReportStatus;
};

export type EvidenceLine = {
  reportId: string;
  label: string;
  effect: number;
  detail: string;
};

export type RoadBelief = {
  roadId: RoadId;
  probability: number;
  verdict: "looks-clear" | "unconfirmed" | "caution" | "avoid";
  title: string;
  explanation: string;
  evidence: EvidenceLine[];
  independentChains: number;
  lastUpdatedMinutes: number;
};

export type Road = {
  id: RoadId;
  name: string;
  detail: string;
  busy: boolean;
};

export const roads: Road[] = [
  {
    id: "market-road",
    name: "Market Road",
    detail: "North junction → residential quarter",
    busy: true,
  },
  {
    id: "river-path",
    name: "River Path",
    detail: "Longer route beside the water",
    busy: false,
  },
  {
    id: "hill-cut",
    name: "Hill Cut",
    detail: "Shortcut behind the mill",
    busy: false,
  },
];

export const initialSources: Source[] = [
  {
    id: "src-whatsapp-a",
    name: "Forwarded WhatsApp message",
    channel: "whatsapp",
    alpha: 2,
    beta: 2,
  },
  {
    id: "src-whatsapp-b",
    name: "Market WhatsApp group",
    channel: "whatsapp",
    alpha: 2,
    beta: 2,
  },
  {
    id: "src-fatima",
    name: "Fatima · shop neighbour",
    channel: "eyewitness",
    alpha: 4,
    beta: 1,
  },
  {
    id: "src-patrol",
    name: "Community patrol",
    channel: "vigilante",
    alpha: 6,
    beta: 1,
  },
];

export const initialReports: Report[] = [
  {
    id: "r-forward-one",
    rawText:
      "My cousin sent a voice note saying armed men are at the north junction on Market Road.",
    sourceId: "src-whatsapp-a",
    createdAt: "6:10 PM",
    claim: {
      roadId: "market-road",
      eventType: "armed_people",
      direction: "danger",
      description: "Armed men reported at the north junction",
      epistemicStatus: "secondhand",
      severity: "high",
      minutesAgo: 30,
      extractionConfidence: 0.91,
      reportedBy: "Cousin via WhatsApp",
      originHint: "north-junction-voice-note",
    },
    clusterId: "cluster-north-junction",
    status: "open",
  },
  {
    id: "r-forward-two",
    rawText:
      "Forwarded: armed men have reached the Market Road junction. Everyone lock up now.",
    sourceId: "src-whatsapp-b",
    createdAt: "6:13 PM",
    claim: {
      roadId: "market-road",
      eventType: "armed_people",
      direction: "danger",
      description: "Armed men reported at the Market Road junction",
      epistemicStatus: "thirdhand",
      severity: "high",
      minutesAgo: 27,
      extractionConfidence: 0.87,
      reportedBy: "Market WhatsApp group",
      originHint: "north-junction-voice-note",
    },
    clusterId: "cluster-north-junction",
    status: "open",
  },
  {
    id: "r-fatima",
    rawText:
      "I am outside my shop. I saw two men carrying long objects move from the junction toward Market Road about 12 minutes ago.",
    sourceId: "src-fatima",
    createdAt: "6:28 PM",
    claim: {
      roadId: "market-road",
      eventType: "movement",
      direction: "danger",
      description: "Two men with long objects moving from the junction",
      epistemicStatus: "firsthand",
      severity: "high",
      minutesAgo: 12,
      extractionConfidence: 0.96,
      reportedBy: "Fatima",
      originHint: null,
    },
    clusterId: "cluster-fatima-sighting",
    status: "open",
  },
  {
    id: "r-river-clear",
    rawText:
      "Our patrol walked River Path eight minutes ago from the bridge to the houses. It was empty.",
    sourceId: "src-patrol",
    createdAt: "6:32 PM",
    claim: {
      roadId: "river-path",
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
    clusterId: "cluster-river-patrol",
    status: "confirmed",
  },
];

const eventStrength: Record<EventType, number> = {
  armed_people: 2.3,
  violence: 2.5,
  road_block: 1.7,
  movement: 1.45,
  all_clear: 1.75,
  unknown: 0.7,
};

const epistemicWeight: Record<EpistemicStatus, number> = {
  firsthand: 1,
  secondhand: 0.48,
  thirdhand: 0.25,
  unknown: 0.3,
};

const severityWeight: Record<Severity, number> = {
  low: 0.7,
  medium: 1,
  high: 1.2,
};

export function sourceReliability(source: Source | undefined) {
  if (!source) return 0.5;
  return source.alpha / (source.alpha + source.beta);
}

function timeWeight(minutesAgo: number) {
  return Math.exp((-Math.LN2 * Math.max(0, minutesAgo)) / 30);
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function verdictFor(probability: number): RoadBelief["verdict"] {
  if (probability < 0.15) return "looks-clear";
  if (probability < 0.4) return "unconfirmed";
  if (probability < 0.7) return "caution";
  return "avoid";
}

const verdictTitle: Record<RoadBelief["verdict"], string> = {
  "looks-clear": "Looks clear",
  unconfirmed: "Unconfirmed",
  caution: "Use caution",
  avoid: "Avoid for now",
};

function clusterReports(reports: Report[]) {
  const groups = new Map<string, Report[]>();
  for (const report of reports) {
    const key = report.clusterId;
    groups.set(key, [...(groups.get(key) ?? []), report]);
  }
  return [...groups.values()];
}

export function calculateRoadBelief(
  roadId: RoadId,
  reports: Report[],
  sources: Source[],
): RoadBelief {
  const road = roads.find((item) => item.id === roadId)!;
  const relevant = reports.filter(
    (report) => report.claim.roadId === roadId && report.status !== "refuted",
  );
  const clusters = clusterReports(relevant);
  // Demo prior: an unresolved evening road starts at 18% danger, not at
  // certainty in either direction. Production would learn this per road/time.
  let logOdds = Math.log(0.18 / 0.82);
  const evidence: EvidenceLine[] = [];

  for (const cluster of clusters) {
    const sorted = [...cluster].sort(
      (a, b) =>
        sourceReliability(sources.find((source) => source.id === b.sourceId)) -
        sourceReliability(sources.find((source) => source.id === a.sourceId)),
    );
    let clusterEffect = 0;
    sorted.forEach((report, index) => {
      const claim = report.claim;
      const reliability = sourceReliability(
        sources.find((source) => source.id === report.sourceId),
      );
      const independenceDiscount = 1 / (index + 1);
      const confirmedBoost = report.status === "confirmed" ? 1.25 : 1;
      const sign = claim.direction === "danger" ? 1 : -1;
      const effect =
        sign *
        eventStrength[claim.eventType] *
        epistemicWeight[claim.epistemicStatus] *
        severityWeight[claim.severity] *
        reliability *
        timeWeight(claim.minutesAgo) *
        independenceDiscount *
        confirmedBoost;
      clusterEffect += effect;
    });

    logOdds += clusterEffect;
    const lead = sorted[0];
    const duplicateCount = Math.max(0, sorted.length - 1);
    evidence.push({
      reportId: lead.id,
      label: lead.claim.description,
      effect: clusterEffect,
      detail:
        duplicateCount > 0
          ? `${duplicateCount + 1} related messages treated as one chain`
          : `${lead.claim.epistemicStatus} · ${lead.claim.minutesAgo} min ago`,
    });
  }

  const dangerClusters = clusters.filter((cluster) =>
    cluster.some((report) => report.claim.direction === "danger"),
  );
  const recentClear = relevant
    .filter(
      (report) =>
        report.claim.direction === "clear" &&
        report.claim.epistemicStatus === "firsthand",
    )
    .sort((a, b) => a.claim.minutesAgo - b.claim.minutesAgo)[0];
  const recentDanger = relevant
    .filter((report) => report.claim.direction === "danger")
    .sort((a, b) => a.claim.minutesAgo - b.claim.minutesAgo)[0];

  if (
    recentClear &&
    recentDanger &&
    recentClear.claim.minutesAgo < recentDanger.claim.minutesAgo
  ) {
    const clearReliability = sourceReliability(
      sources.find((source) => source.id === recentClear.sourceId),
    );
    if (clearReliability >= 0.65) {
      logOdds = logOdds * 0.35 - 1.2 * clearReliability;
      evidence.push({
        reportId: recentClear.id,
        label: "Recent credible contradiction",
        effect: -1.2 * clearReliability,
        detail: "A firsthand pass after the warning pulled the belief down quickly",
      });
    }
  }

  const onlyWeakChain =
    dangerClusters.length === 1 &&
    !dangerClusters[0].some(
      (report) => report.claim.epistemicStatus === "firsthand",
    );
  if (road.busy && onlyWeakChain) {
    const oldest = Math.max(
      ...dangerClusters[0].map((report) => report.claim.minutesAgo),
    );
    if (oldest >= 20) {
      const absencePenalty = Math.min(0.75, (oldest - 15) / 40);
      logOdds -= absencePenalty;
      evidence.push({
        reportId: "absence",
        label: "No independent report followed",
        effect: -absencePenalty,
        detail: "A busy road should have produced another independent signal",
      });
    }
  }

  const probability = sigmoid(logOdds);
  const verdict = verdictFor(probability);
  const positive = evidence
    .filter((line) => line.effect > 0)
    .sort((a, b) => b.effect - a.effect)[0];
  const negative = evidence
    .filter((line) => line.effect < 0)
    .sort((a, b) => a.effect - b.effect)[0];
  let explanation = "No recent reports. That is uncertainty, not proof of safety.";

  if (verdict === "avoid" || verdict === "caution") {
    explanation = `${dangerClusters.length} independent report chain${
      dangerClusters.length === 1 ? "" : "s"
    } affect this road. ${positive?.label ?? "Recent evidence"} carries the most weight.`;
  } else if (negative) {
    explanation = `${negative.label}. Older or repeated warnings carry less weight.`;
  } else if (positive) {
    explanation = `Only ${positive.detail.toLowerCase()}; there is not enough independent evidence to call it confirmed.`;
  }

  return {
    roadId,
    probability,
    verdict,
    title: verdictTitle[verdict],
    explanation,
    evidence: evidence.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)),
    independentChains: clusters.length,
    lastUpdatedMinutes: relevant.length
      ? Math.min(...relevant.map((report) => report.claim.minutesAgo))
      : 0,
  };
}

function words(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

function similarity(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function assignCluster(claim: ExtractedClaim, reports: Report[]) {
  if (claim.originHint) {
    const linked = reports.find(
      (report) =>
        report.claim.originHint &&
        report.claim.originHint.toLowerCase() === claim.originHint?.toLowerCase(),
    );
    if (linked) return linked.clusterId;
  }
  const similar = reports.find(
    (report) =>
      report.claim.roadId === claim.roadId &&
      report.claim.direction === claim.direction &&
      Math.abs(report.claim.minutesAgo - claim.minutesAgo) <= 20 &&
      similarity(report.claim.description, claim.description) >= 0.38,
  );
  return similar?.clusterId ?? `cluster-${Date.now()}`;
}

export function updateSourceOutcome(
  source: Source,
  outcome: "confirmed" | "refuted",
) {
  return {
    ...source,
    alpha: source.alpha + (outcome === "confirmed" ? 1 : 0),
    beta: source.beta + (outcome === "refuted" ? 1 : 0),
  };
}

export function roadName(id: RoadId) {
  return roads.find((road) => road.id === id)?.name ?? id;
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
