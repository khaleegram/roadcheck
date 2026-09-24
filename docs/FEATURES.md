# RoadCheck — how it works (developer reference)

Product intent and voice rules for anyone (human or AI) changing the code:
`.cursor/rules/roadcheck-product.mdc`.

## Two layers

**Language layer** — `lib/ai.ts` (Groq client, JSON-mode + Zod validation, one
retry, fallbacks) and `lib/prompts.ts` (every prompt; the model internals are
explained to the model here so it can reason about them).

**Belief layer** — `lib/roadcheck.ts`. Log-odds per place:

- base strength by event type × severity
- hearsay: firsthand 1, secondhand 0.5, thirdhand 0.25, unknown 0.3
- source reliability `α/(α+β)`, cold start `Beta(2,2)`
- time decay, 30-minute half-life
- extraction confidence floor 0.35
- chains: reports judged the same event share a `clusterId`; harmonic weights 1, ½, ⅓ …
- coordinated cold-start accounts (near-identical text, ≤ 8 min apart, no firsthand) → one report × 0.55
- silence: a busy place with only one weak danger chain loses up to 0.75 log-odds after 20 min
- contradiction: a trusted (≥ 0.65) firsthand all-clear after the latest warning collapses toward safe
- verdict bands: < 0.15 probably fine, < 0.4 nobody knows yet, < 0.7 be careful, else don't go

Each `EvidenceLine` has internal `label`/`detail` (fed to the model via
`evidenceNotes()`) and a user-facing `plain` sentence. Only `plain` is rendered.

## AI jobs

| Job | Route | Model | Fallback |
|---|---|---|---|
| Read report + follow-up (≤ 3 rounds) | `POST /api/analyze` | `ROADCHECK_MODEL` (llama-3.3-70b-versatile) | keyword reader, same shape |
| Same-event check | inside `POST /api/reports` | main model | word-overlap `assignCluster` |
| Busy / quiet place | from analyze → stored on new location | main model | keyword guess |
| Plain answer | `POST /api/explain` (belief computed server-side from the store) | `ROADCHECK_FAST_MODEL` (llama-3.1-8b-instant) | `fallbackExplanation()` |

The explanation guard (`acceptableAnswer` in `lib/prompts.ts`) rejects model
text that mentions internals (AI, score, chain, %, …) or contradicts the verdict.

## Seeing what ran

- API responses carry `readBy: "model" | "rules"` and `aiNote` (why the fallback ran).
- `GET /api/status` — mode, models, live probe.
- Dev-only `DevPanel` at the bottom of the page logs each AI job.
- Server logs: `[roadcheck ai] …` on every failure.

## Environment

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Free key from console.groq.com. Absent → fallbacks. |
| `ROADCHECK_MODEL` / `ROADCHECK_FAST_MODEL` | Override open-weight model ids. |
| `ROADCHECK_REHEARSAL=1` | Force the fallbacks even with a key. |
