import { judge, rehearse, samples, splitMessages } from "../lib/graph";

const expected: Record<string, string> = {
  reached: "wait",
  radio: "wait",
  earlier: "wait",
  after: "go",
};

let failed = 0;

for (const sample of samples) {
  const read = rehearse(splitMessages(sample.text));
  const answer = judge(read.claims)[0];
  const ok = answer?.verdict === expected[sample.id];
  console.log(`${ok ? "ok" : "FAIL"} ${sample.id} → ${answer?.verdict}`);
  console.log(`  ${answer?.headline}`);
  console.log(
    `  chains: ${answer?.chains.map((chain) => `${chain.story}/${chain.role}/${chain.speakers.join("+")}`).join(" | ")}`,
  );
  if (!ok) failed += 1;
  if (sample.id === "radio" && !answer?.radioNote.includes("not")) failed += 1;
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
