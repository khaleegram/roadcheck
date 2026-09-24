import { keepStarterReportsCurrent } from "@/lib/seed";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  await keepStarterReportsCurrent();
  const store = await getStore();
  return Response.json({ ...store, now: Date.now() });
}
