# RoadCheck

AI-assisted, trust-calibrated road safety signals for communities facing too
much noise and too little verified information.

Amara is closing her shop at 6:40 PM. A cousin's voice note says something is
happening on the road, a neighbour saw movement, and the vigilante radio cannot
reach everyone. She does not need a weekly report. She needs a calm answer now,
and she needs to understand why she should trust it.

RoadCheck turns raw reports into a live belief for each road. It deliberately
keeps the language model out of the trust decision:

> **AI reads language. Transparent math decides trust.**

## What the prototype does

- Accepts a raw text report or voice-note transcript.
- Uses AI to extract road, event, time, severity, source distance
  (firsthand/secondhand/thirdhand), and extraction uncertainty.
- Asks one targeted follow-up when the report is missing a critical fact.
- Groups copied or related messages into one evidence chain so five forwards
  do not become five witnesses.
- Maintains a Bayesian-style danger belief for each road using source
  reliability, hearsay depth, severity, recency, and diminishing returns.
- Treats missing expected corroboration on a busy road as negative evidence.
- Lets a recent credible firsthand contradiction pull an old warning down
  quickly.
- Lets an operator confirm or refute reports, updating the source's Beta
  reliability ledger.
- Shows Amara a plain verdict and the evidence that moved it.

The seeded fictional evening demonstrates three roads:

- **Market Road:** two WhatsApp forwards are one chain; Fatima's independent
  sighting is another.
- **River Path:** a community patrol reports a direct all-clear.
- **Hill Cut:** no report means uncertainty, not proof that it is safe.

## How the belief works

Each road stores log-odds of danger. A report contributes:

```text
event strength
× firsthand/hearsay weight
× source reliability
× severity
× time decay
× within-cluster independence discount
```

Danger claims add to the log-odds; direct clear reports subtract. Related
reports receive harmonic diminishing returns. A credible direct pass that
happened after a warning triggers an asymmetric collapse rather than behaving
like one ordinary negative vote.

The numbers in this screening prototype are explicit demo parameters, not
field-calibrated safety guarantees.

## Run locally

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run the trust-engine checks and production build:

```bash
npm run test:engine
npm run lint
npm run build
```

## AI configuration

The app uses the Vercel AI SDK and AI Gateway. On Vercel, OIDC supplies the
gateway identity. Locally, link the project and pull its environment:

```bash
npx vercel link
npx vercel env pull
```

`ROADCHECK_MODEL` optionally changes the model (default:
`openai/gpt-5.4-mini`). `ROADCHECK_REHEARSAL=1` forces the transparent local
reader.

If the gateway is unavailable, the prototype remains usable through a visible,
deterministic extraction fallback. The UI labels which reader handled the
report. The belief calculation is identical in both cases.

## Architecture

```text
raw report
  → AI extraction + one clarifying question
  → structured claim
  → related-report clustering
  → source reliability ledger
  → transparent road belief engine
  → verdict + evidence trace
```

- `app/api/analyze/route.ts` — structured AI extraction and fallback reader
- `lib/roadcheck.ts` — clustering, source reputation, and belief calculation
- `components/roadcheck-app.tsx` — report intake, road monitor, verification,
  and source ledger
- `scripts/engine-check.ts` — executable checks for the critical trust rules

The demo persists changes in the browser so a reviewer can confirm/refute
reports and watch beliefs change without needing an account.

## Limitations and next steps

- The demo data is fictional and browser-local.
- Production parameters need calibration against real, ethically collected
  outcomes; a probability must never be presented as a safety guarantee.
- Real deployment needs authenticated reporters, abuse controls, audit logs,
  consent and retention policies, and human escalation.
- Next: WhatsApp/SMS intake, speech-to-text for voice notes, geocoded road
  segments, persistent storage, low-bandwidth SMS/USSD access, and community
  governance for confirmation/refutation.
