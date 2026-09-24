import { explainBelief } from "@/lib/answers";
import {
  calculateRoadBelief,
  evidenceNotes,
  locationIdFromName,
} from "@/lib/roadcheck";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 20;

const cache = new Map<string, string>();

export async function POST(request: Request) {
  let body: { locationId?: unknown; locationName?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Missing place." }, { status: 400 });
  }
  const locationName =
    typeof body.locationName === "string" ? body.locationName.trim().slice(0, 120) : "";
  const locationId =
    typeof body.locationId === "string" && body.locationId
      ? body.locationId
      : locationIdFromName(locationName);
  if (!locationName) {
    return Response.json({ error: "Missing place." }, { status: 400 });
  }

  const { locations, reports, sources } = await getStore();
  const location = locations.find((item) => item.id === locationId) ?? {
    id: locationId,
    name: locationName,
    busy: true,
  };
  const belief = calculateRoadBelief(location, reports, sources);
  const key = `${locationId}:${belief.verdict}:${evidenceNotes(belief).join("|")}`;

  const cached = cache.get(key);
  if (cached) {
    return Response.json({ sentence: cached, readBy: "model", aiNote: null });
  }

  const answer = await explainBelief(location, belief);
  if (answer.readBy === "model") {
    cache.set(key, answer.sentence);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  return Response.json(answer);
}
