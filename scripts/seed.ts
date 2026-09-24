/**
 * Fills data/roadcheck.json with starter reports filed through the real AI
 * pipeline. Replaces whatever is in the store.
 *
 *   npm run seed
 */
import { AI_PROVIDER, getAiMode, ROADCHECK_MODEL_ID } from "../lib/ai";
import { seedStore } from "../lib/seed";

async function main() {
  console.log(
    getAiMode() === "live"
      ? `reading reports with ${AI_PROVIDER} · ${ROADCHECK_MODEL_ID}`
      : "no AI key — using the built-in reader",
  );
  const { store, log } = await seedStore();
  for (const entry of log) {
    console.log(`\n${entry.place} · ${entry.source} [${entry.readBy}]`);
    console.log(`  "${entry.text}"`);
    for (const turn of entry.turns) console.log(`  asked: ${turn.question}\n  → ${turn.answer}`);
    console.log(`  understood: ${entry.understood} (${entry.howTheyKnow})`);
    if (entry.sameEventBy) console.log(`  same event as: ${entry.sameAs ?? "none"} [${entry.sameEventBy}]`);
  }
  console.log(
    `\nsaved ${store.reports.length} reports on ${store.locations.length} roads from ${store.sources.length} people`,
  );
}

void main();
