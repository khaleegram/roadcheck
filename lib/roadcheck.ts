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
  locationId: string;
  locationName: string;
  eventType: EventType;
  direction: ClaimDirection;
  description: string;
  epistemicStatus: EpistemicStatus;
  severity: Severity;
  minutesAgo: number;
  extractionConfidence: number;
  reportedBy: string;
  originHint: string | null;
  whatWasSeen?: string | null;
  timeReference?: string | null;
  reporterRelationship?: string | null;
};

export type Report = {
  id: string;
  rawText: string;
  sourceId: string;
  createdAt: string;
  occurredAt: string;
  claim: ExtractedClaim;
  clusterId: string;
  status: ReportStatus;
};

export type EvidenceKind =
  | "report"
  | "chain"
  | "coordinated"
  | "contradiction"
  | "silence";

export type EvidenceLine = {
  reportId: string;
  kind: EvidenceKind;
  /** Internal wording for the model and developers. */
  label: string;
  detail: string;
  /** What a person reading the app sees. */
  plain: string;
  effect: number;
  minutesAgo: number | null;
};

export type RoadBelief = {
  locationId: string;
  probability: number;
  logOdds: number;
  verdict: "looks-clear" | "unconfirmed" | "caution" | "avoid";
  title: string;
  explanation: string;
  evidence: EvidenceLine[];
  independentChains: number;
  lastUpdatedMinutes: number;
};

export type Location = {
  id: string;
  name: string;
  busy: boolean;
};

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
  secondhand: 0.5,
  thirdhand: 0.25,
  unknown: 0.3,
};

const severityWeight: Record<Severity, number> = {
  low: 0.7,
  medium: 1,
  high: 1.2,
};

const SAFE_LOG_ODDS = Math.log(0.08 / 0.92);
const PRIOR_LOG_ODDS = Math.log(0.18 / 0.82);

export function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function locationIdFromName(name: string) {
  return normalizeKey(name) || "unknown-location";
}

export function sourceIdFromHandle(handle: string) {
  return `src-${normalizeKey(handle) || "anonymous"}`;
}

export function minutesSince(iso: string, now = Date.now()) {
  return Math.max(0, (now - Date.parse(iso)) / 60_000);
}

export function sourceReliability(source: Source | undefined) {
  if (!source) return 0.5;
  return source.alpha / (source.alpha + source.beta);
}

export function isColdStart(source: Source | undefined) {
  if (!source) return true;
  return source.alpha === 2 && source.beta === 2;
}

function timeWeight(minutesAgo: number) {
  return Math.exp((-Math.LN2 * Math.max(0, minutesAgo)) / 30);
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

export function verdictFor(probability: number): RoadBelief["verdict"] {
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

function reportWeight(report: Report, sources: Source[], now: number) {
  const claim = report.claim;
  const reliability = sourceReliability(
    sources.find((source) => source.id === report.sourceId),
  );
  const confirmedBoost = report.status === "confirmed" ? 1.25 : 1;
  const sign = claim.direction === "danger" ? 1 : -1;
  const age = minutesSince(report.occurredAt, now);
  return (
    sign *
    eventStrength[claim.eventType] *
    epistemicWeight[claim.epistemicStatus] *
    severityWeight[claim.severity] *
    reliability *
    timeWeight(age) *
    Math.max(0.35, claim.extractionConfidence) *
    confirmedBoost
  );
}

function clusterReports(reports: Report[]) {
  const groups = new Map<string, Report[]>();
  for (const report of reports) {
    const key = report.clusterId;
    groups.set(key, [...(groups.get(key) ?? []), report]);
  }
  return [...groups.values()];
}

export function isCoordinatedCluster(cluster: Report[], sources: Source[]) {
  if (cluster.length < 2) return false;
  const hasFirsthand = cluster.some(
    (report) => report.claim.epistemicStatus === "firsthand",
  );
  if (hasFirsthand) return false;
  const cold = cluster.filter((report) =>
    isColdStart(sources.find((source) => source.id === report.sourceId)),
  );
  if (cold.length < 2) return false;
  const times = cluster.map((report) => report.claim.minutesAgo);
  const spread = Math.max(...times) - Math.min(...times);
  if (spread > 8) return false;
  for (let i = 0; i < cluster.length; i += 1) {
    for (let j = i + 1; j < cluster.length; j += 1) {
      if (
        similarity(cluster[i].rawText, cluster[j].rawText) >= 0.55 ||
        similarity(cluster[i].claim.description, cluster[j].claim.description) >=
          0.62
      ) {
        return true;
      }
    }
  }
  return false;
}

function applyCluster(
  cluster: Report[],
  sources: Source[],
  now: number,
) {
  const sorted = [...cluster].sort(
    (a, b) =>
      Math.abs(reportWeight(b, sources, now)) -
      Math.abs(reportWeight(a, sources, now)),
  );
  const coordinated = isCoordinatedCluster(cluster, sources);
  let clusterEffect = 0;
  if (coordinated) {
    clusterEffect = reportWeight(sorted[0], sources, now) * 0.55;
  } else {
    sorted.forEach((report, index) => {
      clusterEffect += reportWeight(report, sources, now) * (1 / (index + 1));
    });
  }
  return { sorted, coordinated, clusterEffect };
}

export function calculateRoadBelief(
  location: Location,
  reports: Report[],
  sources: Source[],
  now = Date.now(),
): RoadBelief {
  const live = reports.filter((report) => report.status !== "refuted");
  const onRoad = live.filter(
    (report) => report.claim.locationId === location.id,
  );
  const clusters = clusterReports(onRoad);
  let logOdds = PRIOR_LOG_ODDS;
  const evidence: EvidenceLine[] = [];

  for (const cluster of clusters) {
    const { sorted, coordinated, clusterEffect } = applyCluster(
      cluster,
      sources,
      now,
    );
    logOdds += clusterEffect;
    const lead = sorted[0];
    const duplicateCount = Math.max(0, sorted.length - 1);
    const age = Math.round(minutesSince(lead.occurredAt, now));
    const what = lead.claim.whatWasSeen || lead.claim.description;
    const kind: EvidenceKind = coordinated
      ? "coordinated"
      : duplicateCount > 0
        ? "chain"
        : "report";
    evidence.push({
      reportId: lead.id,
      kind,
      label: coordinated
        ? "Coordinated cold-start reports collapsed"
        : lead.claim.description,
      detail: coordinated
        ? `${sorted.length} near-identical new accounts treated as one discounted source`
        : duplicateCount > 0
          ? `${duplicateCount + 1} related messages treated as one chain (lead is ${lead.claim.epistemicStatus}, ${age} min ago)`
          : `${lead.claim.epistemicStatus} · ${age} min ago · ${lead.claim.reporterRelationship ?? lead.claim.reportedBy}`,
      plain: coordinated
        ? `${sorted.length} new accounts posted almost the same message at the same time, so we count it once: ${sentenceCase(what)}`
        : duplicateCount > 0
          ? `${duplicateCount + 1} people passed on the same story, ${ago(age)}: ${sentenceCase(what)}`
          : `${whoSaid(lead.claim)}, ${ago(age)}: ${sentenceCase(what)}`,
      effect: clusterEffect,
      minutesAgo: age,
    });
  }

  const dangerClusters = clusters.filter((cluster) =>
    cluster.some((report) => report.claim.direction === "danger"),
  );
  const recentClear = onRoad
    .filter(
      (report) =>
        report.claim.direction === "clear" &&
        report.claim.epistemicStatus === "firsthand",
    )
    .sort(
      (a, b) =>
        minutesSince(a.occurredAt, now) - minutesSince(b.occurredAt, now),
    )[0];
  const recentDanger = onRoad
    .filter((report) => report.claim.direction === "danger")
    .sort(
      (a, b) =>
        minutesSince(a.occurredAt, now) - minutesSince(b.occurredAt, now),
    )[0];

  if (
    recentClear &&
    recentDanger &&
    minutesSince(recentClear.occurredAt, now) <
      minutesSince(recentDanger.occurredAt, now)
  ) {
    const clearReliability = sourceReliability(
      sources.find((source) => source.id === recentClear.sourceId),
    );
    if (clearReliability >= 0.65) {
      const before = logOdds;
      logOdds = logOdds * 0.35 + SAFE_LOG_ODDS * 0.65;
      const age = Math.round(minutesSince(recentClear.occurredAt, now));
      evidence.push({
        reportId: recentClear.id,
        kind: "contradiction",
        label: "Recent credible contradiction",
        detail:
          "A firsthand pass after the warning collapsed belief toward clear",
        plain: `Someone with a good track record passed through ${ago(age)}, after the warning, and says it was clear`,
        effect: logOdds - before,
        minutesAgo: age,
      });
    }
  }

  const onlyWeakChain =
    dangerClusters.length === 1 &&
    !dangerClusters[0].some(
      (report) => report.claim.epistemicStatus === "firsthand",
    );
  if (location.busy && onlyWeakChain) {
    const oldest = Math.max(
      ...dangerClusters[0].map((report) =>
        minutesSince(report.occurredAt, now),
      ),
    );
    if (oldest >= 20) {
      const absencePenalty = Math.min(0.75, (oldest - 15) / 40);
      logOdds -= absencePenalty;
      evidence.push({
        reportId: "absence",
        kind: "silence",
        label: "No independent report followed",
        detail: "A busy road should have produced another independent signal",
        plain: `This is a busy place and nobody else has mentioned it in ${Math.round(oldest)} minutes`,
        effect: -absencePenalty,
        minutesAgo: Math.round(oldest),
      });
    }
  }

  const probability = sigmoid(logOdds);
  const verdict = verdictFor(probability);
  const explanation = fallbackExplanation({
    locationName: location.name,
    verdict,
    evidence,
    dangerClusters: dangerClusters.length,
    onRoadCount: onRoad.length,
    firsthandDanger: onRoad.some(
      (report) =>
        report.claim.direction === "danger" &&
        report.claim.epistemicStatus === "firsthand",
    ),
  });

  return {
    locationId: location.id,
    probability,
    logOdds,
    verdict,
    title: verdictTitle[verdict],
    explanation,
    evidence: evidence.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)),
    independentChains: clusters.length,
    lastUpdatedMinutes: onRoad.length
      ? Math.min(...onRoad.map((report) => minutesSince(report.occurredAt, now)))
      : 0,
  };
}

const whoPhrase: Record<EpistemicStatus, string> = {
  firsthand: "Someone who was there",
  secondhand: "Someone who heard it from a person they know",
  thirdhand: "A forwarded message",
  unknown: "Someone",
};

function whoSaid(claim: ExtractedClaim) {
  if (claim.direction === "clear" && claim.epistemicStatus === "firsthand") {
    return "Someone who passed through";
  }
  return whoPhrase[claim.epistemicStatus];
}

function ago(minutes: number) {
  if (minutes < 2) return "just now";
  if (minutes < 60) return `about ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function sentenceCase(value: string) {
  const text = value.trim().replace(/\.$/, "");
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Plain-language answer used when the model is unavailable. */
export function fallbackExplanation(input: {
  locationName: string;
  verdict: RoadBelief["verdict"];
  evidence: EvidenceLine[];
  dangerClusters: number;
  onRoadCount: number;
  firsthandDanger?: boolean;
}): string {
  const place = input.locationName;
  const danger = input.evidence
    .filter((line) => line.effect > 0)
    .sort((a, b) => b.effect - a.effect);
  const contradiction = input.evidence.find(
    (line) => line.kind === "contradiction",
  );
  const silence = input.evidence.find((line) => line.kind === "silence");
  const latest = danger
    .map((line) => line.minutesAgo ?? 0)
    .sort((a, b) => a - b)[0];

  if (input.onRoadCount === 0) {
    return `Nobody has reported anything about ${place} recently, so we can't say either way. Ask someone who has just come from there.`;
  }
  if (input.verdict === "avoid") {
    const people = input.dangerClusters;
    const who =
      people > 1
        ? `${people} separate reports say`
        : input.firsthandDanger && input.onRoadCount > 1
          ? "Several people who were there say"
          : input.firsthandDanger
            ? "Someone who was there says"
            : "A strong report says";
    return `${who} there is trouble on ${place}${latest != null ? `, the latest ${ago(latest)}` : ""}. Take another route if you can.`;
  }
  if (input.verdict === "caution") {
    return `There are reports of trouble on ${place} that haven't been fully backed up yet. Go carefully, or wait a little for more news.`;
  }
  if (contradiction) {
    return `Someone reliable passed ${place} ${ago(contradiction.minutesAgo ?? 0)} and says it's clear, which outweighs the earlier warning.`;
  }
  if (input.verdict === "looks-clear") {
    return `Recent reports from people who passed ${place} say it's clear.`;
  }
  if (silence) {
    return `There's one unconfirmed report about ${place}, and nobody else at this busy spot has mentioned it. Treat it with care, not panic.`;
  }
  if (danger.length && input.firsthandDanger) {
    return `Someone who was there reported trouble on ${place}${latest != null ? ` ${ago(latest)}` : ""}, but nobody else has backed it up yet. Stay alert and check again before you go.`;
  }
  if (danger.length) {
    return `There's a report about ${place}, but it's secondhand and nobody has backed it up yet. Treat it with care, not panic.`;
  }
  return `What we've heard about ${place} is too thin to call. Ask someone who has just come from there.`;
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

export function similarity(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function findLocation(name: string, locations: Location[]) {
  const id = locationIdFromName(name);
  const exact = locations.find((item) => item.id === id);
  if (exact) return exact;
  return (
    locations.find((item) => similarity(item.name, name) >= 0.55) ?? null
  );
}

export function assignCluster(claim: ExtractedClaim, reports: Report[]) {
  if (claim.originHint) {
    const linked = reports.find(
      (report) =>
        report.claim.originHint &&
        report.claim.originHint.toLowerCase() ===
          claim.originHint?.toLowerCase() &&
        report.claim.locationId === claim.locationId,
    );
    if (linked) return linked.clusterId;
  }
  const similar = reports.find(
    (report) =>
      report.claim.locationId === claim.locationId &&
      report.claim.direction === claim.direction &&
      Math.abs(report.claim.minutesAgo - claim.minutesAgo) <= 20 &&
      (similarity(report.claim.description, claim.description) >= 0.38 ||
        similarity(report.rawText, claim.description) >= 0.38),
  );
  return similar?.clusterId ?? `cluster-${Date.now()}`;
}

/** Recent reports that could plausibly be the same event, for the model to judge. */
export function sameEventCandidates(
  claim: ExtractedClaim,
  reports: Report[],
  now = Date.now(),
) {
  return reports
    .filter(
      (report) =>
        report.status !== "refuted" &&
        report.claim.locationId === claim.locationId &&
        report.claim.direction === claim.direction &&
        Math.abs(minutesSince(report.occurredAt, now) - claim.minutesAgo) <= 45,
    )
    .slice(-8);
}

export function matchExistingSource(handle: string, sources: Source[]) {
  const key = normalizeKey(handle);
  if (!key) return null;
  return (
    sources.find(
      (source) =>
        source.id === sourceIdFromHandle(handle) ||
        normalizeKey(source.name) === key,
    ) ?? null
  );
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

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

const FROZEN_TIME =
  /,?\s*(?:reported\s+)?(?:about\s+|around\s+|like\s+)?(?:\d+\s*(?:minutes?|mins?|hours?|hrs?)\s+ago|just now|right now|a moment ago)/gi;

/** Internal notes handed to the explanation model. */
export function evidenceNotes(belief: RoadBelief) {
  return belief.evidence.map((line) => {
    const label = line.label.replace(FROZEN_TIME, "").replace(/\s+\./g, ".").trim();
    const when = line.minutesAgo != null ? ` [happened ${line.minutesAgo} min ago]` : "";
    return `[${line.kind}] ${label} — ${line.detail}${when} (${line.effect > 0 ? "raises" : "lowers"} danger)`;
  });
}
