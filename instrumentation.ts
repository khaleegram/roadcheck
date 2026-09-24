export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ROADCHECK_SEED_ON_START !== "1") return;
  const { getStore } = await import("@/lib/store");
  const store = await getStore();
  if (store.reports.length > 0) return;
  const { seedStore } = await import("@/lib/seed");
  void seedStore().catch((error) => console.error("starter reports failed", error));
}
