import { judgeSameEvent } from "@/lib/answers";
import {
  assignCluster,
  locationIdFromName,
  matchExistingSource,
  sameEventCandidates,
  sourceIdFromHandle,
  updateSourceOutcome,
  type ExtractedClaim,
  type Report,
  type Source,
} from "@/lib/roadcheck";
import { getStore, withStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

async function clusterFor(claim: ExtractedClaim, rawText: string) {
  const { reports } = await getStore();
  const candidates = sameEventCandidates(claim, reports);
  if (!candidates.length) return null;
  const judged = await judgeSameEvent(claim, rawText, candidates);
  if (!judged.ok) return null;
  return judged.match?.clusterId ?? `cluster-${Date.now()}`;
}

export async function POST(request: Request) {
  let body: {
    rawText?: unknown;
    handle?: unknown;
    claim?: ExtractedClaim;
    placeIsBusy?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a report." }, { status: 400 });
  }

  const rawText =
    typeof body.rawText === "string" ? body.rawText.trim().slice(0, 1800) : "";
  const handle =
    typeof body.handle === "string" ? body.handle.trim().slice(0, 80) : "";
  const claim = body.claim;
  if (!claim || rawText.length < 8 || handle.length < 2) {
    return Response.json(
      { error: "Add your name and what you heard, then try again." },
      { status: 400 },
    );
  }

  const locationId = claim.locationId || locationIdFromName(claim.locationName);
  const judgedCluster = await clusterFor({ ...claim, locationId }, rawText);

  const store = await withStore((current) => {
    const existingLocation = current.locations.find(
      (item) => item.id === locationId,
    );
    if (!existingLocation) {
      current.locations.push({
        id: locationId,
        name: claim.locationName,
        busy: body.placeIsBusy !== false,
      });
    }
    const known = matchExistingSource(handle, current.sources);
    const source: Source =
      known ??
      ({
        id: sourceIdFromHandle(handle),
        name: handle,
        channel:
          claim.epistemicStatus === "firsthand" ? "eyewitness" : "whatsapp",
        alpha: 2,
        beta: 2,
      } satisfies Source);
    if (!known) current.sources.push(source);

    const now = Date.now();
    const occurredAt = new Date(
      now - Math.max(0, claim.minutesAgo) * 60_000,
    ).toISOString();
    const report: Report = {
      id: `r-${now}`,
      rawText,
      sourceId: source.id,
      createdAt: new Date(now).toISOString(),
      occurredAt,
      claim: { ...claim, locationId },
      clusterId:
        judgedCluster ?? assignCluster({ ...claim, locationId }, current.reports),
      status: "open",
    };
    current.reports.push(report);
    return { report, source };
  });

  return Response.json(store);
}

export async function PATCH(request: Request) {
  let body: { reportId?: unknown; outcome?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Something went wrong. Try again." }, { status: 400 });
  }
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const outcome =
    body.outcome === "confirmed" || body.outcome === "refuted"
      ? body.outcome
      : null;
  if (!reportId || !outcome) {
    return Response.json({ error: "Something went wrong. Try again." }, { status: 400 });
  }

  const updated = await withStore((current) => {
    const report = current.reports.find((item) => item.id === reportId);
    if (!report) return null;
    report.status = outcome;
    current.sources = current.sources.map((source) =>
      source.id === report.sourceId
        ? updateSourceOutcome(source, outcome)
        : source,
    );
    return report;
  });

  if (!updated) {
    return Response.json({ error: "That report is no longer here." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
