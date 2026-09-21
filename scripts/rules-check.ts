import { samples } from "../lib/board";
import { decide, rehearse } from "../lib/decide";

const expected: Record<string, string> = {
  cousin: "wait",
  fire: "go",
  quiet: "stay",
};

let failed = 0;

for (const sample of samples) {
  const extraction = rehearse(sample.message);
  const decision = decide(sample.route, extraction);
  const ok = decision.verdict === expected[sample.id];
  console.log(
    `${ok ? "ok" : "FAIL"} ${sample.id} → ${decision.verdict} (${extraction.kind}, routes=${extraction.routes.join(",")})`,
  );
  console.log(`  ${decision.headline}`);
  if (!ok) failed += 1;
}

const marketFire = decide(
  "market",
  rehearse(samples.find((sample) => sample.id === "fire")!.message),
);
console.log(`market+panic → ${marketFire.verdict}`);
if (marketFire.verdict !== "wait") failed += 1;

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
