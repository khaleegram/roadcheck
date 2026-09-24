/**
 * Files the starter reports through the real AI pipeline in memory (never
 * touches data/roadcheck.json) and checks what each road ends up saying.
 *
 *   npm run test:ai
 */
import { AI_PROVIDER, getAiMode, ROADCHECK_MODEL_ID } from "../lib/ai";
import { explainBelief } from "../lib/answers";
import { acceptableAnswer, verdictPhrase } from "../lib/prompts";
import { calculateRoadBelief } from "../lib/roadcheck";
import { buildSeed } from "../lib/seed";

let failures = 0;
function check(ok: boolean, message: string, detail?: unknown) {
  console.log(`${ok ? "ok  " : "FAIL"} · ${message}`);
  if (detail !== undefined) console.log(`       ${JSON.stringify(detail)}`);
  if (!ok) failures += 1;
}

async function main() {
  if (getAiMode() !== "live") {
    console.error("No AI key in .env.local (CEREBRAS_API_KEY or GROQ_API_KEY), or ROADCHECK_REHEARSAL=1.");
    process.exit(1);
  }
  console.log(`provider: ${AI_PROVIDER} · model: ${ROADCHECK_MODEL_ID}\n`);

  const { store, log } = await buildSeed();
  for (const entry of log) {
    console.log(`${entry.place} · ${entry.source}: ${entry.understood} (${entry.howTheyKnow})`);
    for (const turn of entry.turns) console.log(`   asked: ${turn.question}`);
    if (entry.sameEventBy) console.log(`   same event as: ${entry.sameAs ?? "none"}`);
  }
  check(log.every((entry) => entry.readBy === "model"), "every report was read by the model");
  check(log.every((entry) => entry.sameEventBy !== "rules"), "every same-event check used the model");

  const byPlace = (name: string) => log.filter((entry) => entry.place === name);
  const [rumour, witness] = byPlace("Kaduna-Zaria Junction");
  check(rumour.turns.length > 0, "rumour: asked a follow-up question");
  check(rumour.howTheyKnow !== "firsthand", "rumour: not treated as firsthand", rumour.howTheyKnow);
  check(witness.howTheyKnow === "firsthand", "witness: recognised as firsthand");
  check(witness.sameAs === "Musa", "witness: same event as the rumour", witness.sameAs);
  check(byPlace("Central Market Road")[1].sameAs === "Blessing", "copy-paste: same event as the first forward");
  check(
    store.locations.find((location) => location.name === "Kurmin Mashi farm road")?.busy === false,
    "farm road tagged as quiet",
  );

  const expected: Record<string, string[]> = {
    "Kaduna-Zaria Junction": ["looks-clear"],
    "Kawo Bridge": ["caution", "avoid"],
    "Ahmadu Bello Way": ["looks-clear", "unconfirmed"],
    "Central Market Road": ["unconfirmed", "caution"],
    "Kurmin Mashi farm road": ["unconfirmed", "caution"],
    "Kachia Road": ["avoid"],
  };
  console.log("");
  for (const location of store.locations) {
    const belief = calculateRoadBelief(location, store.reports, store.sources);
    const answer = await explainBelief(location, belief);
    console.log(`${location.name} → ${verdictPhrase[belief.verdict]}: ${answer.sentence}`);
    check(
      (expected[location.name] ?? []).includes(belief.verdict),
      `${location.name}: expected ${expected[location.name]?.join(" or ")}`,
      belief.verdict,
    );
    check(answer.readBy === "model", `${location.name}: answer written by the model`, answer.aiNote);
    check(acceptableAnswer(answer.sentence, belief.verdict), `${location.name}: answer is plain and agrees with the math`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall AI checks passed");
  process.exit(failures ? 1 : 0);
}

void main();
