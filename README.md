# Clearpath

Amara is closing her shop at 6:40 PM. A cousin forwarded a voice note, a neighbour saw something, and the vigilante radio can reach a few people, not the street. By the time a story gets to her it is either too late or it is a rumour that empties the market for nothing.

Clearpath does one thing. She pastes what she just heard, picks the road home, and gets a single word: **Go**, **Wait**, or **Stay** — plus the reason, in a sentence she can read while she locks the shutter.

## Why this

The scarce thing is not another chat. It is a verified signal she can trust in the moment.

The model reads messy language (a WhatsApp forward, a voice-note retelling) and turns it into a claim: what kind of message it is, and which road it is actually about. A short set of rules then decides, using a signal board of reports people filed this evening.

The model is not allowed to confirm an incident. Confirmation is a status a person puts on the board. That split is the product:

- One unchecked sighting means **wait**. It does not mean the street should run.
- A cousin's retelling of that sighting is not a second witness.
- A "the whole town is on fire" forward does not close a road a patrol already walked.
- A neighbour saying a road "looks quiet" does not erase a report the night chair already confirmed.

Kasuwa, the board, and the clock are a fictional evening so the prototype can be judged on the decision, not on a live feed.

## Try it

Three messages are wired to the three answers:

| Paste this | Road | Answer |
| --- | --- | --- |
| Cousin on WhatsApp | Market Road | Wait |
| The town is on fire | River Path | Go |
| Hill looks quiet | Hill Cut | Stay |

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The check works without a model key. If the model cannot be reached, the same rules run on a rehearsal reading of the message, and the screen says so.

To use the model locally, link a Vercel project that has AI Gateway access and pull its env, then restart:

```bash
npx vercel link
npx vercel env pull
```

Optional: set `CLEARPATH_MODEL` (default `openai/gpt-5.4-mini`). Set `CLEARPATH_REHEARSAL=1` to force the rules-only path.

## Deploy

The app is a Next.js App Router project. Import the repo in Vercel and deploy. AI Gateway authentication is provided on Vercel; no provider key belongs in the repo.

```bash
npm run build
```
