import { NextResponse } from "next/server";
import { seedStore } from "@/lib/seed";

export const maxDuration = 300;

/** Owner-only refresh of the starter reports. Disabled unless SEED_TOKEN is set. */
export async function POST(request: Request) {
  const token = process.env.SEED_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { store, log } = await seedStore();
  return NextResponse.json({
    reports: store.reports.length,
    roads: store.locations.length,
    readByModel: log.filter((entry) => entry.readBy === "model").length,
  });
}
