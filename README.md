# RoadCheck

Check whether a road is safe right now, and tell others what you've seen.

Reports arrive the way they do in real life — forwards, voice-note
transcripts, "my cousin said", someone who just passed through — in English
or Pidgin. RoadCheck reads them, asks the reporter the one question that
matters most, and gives anyone checking that road a calm, plain answer with
the reasons behind it.

**The language model reads and explains; a transparent belief model decides.**
The model never picks whether a road is safe.

**Live:** LIVE_URL

## Setup

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local   # paste CEREBRAS_API_KEY or GROQ_API_KEY
npm run seed                 # optional: starter reports on six roads
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without a key everything still works using a keyword reader and template
answers; with one, open-weight models (Qwen on Cerebras, or Llama on Groq)
do the reading and writing.

## Using it

- **Check** — type a road or area. Each place has its own shareable page
  (`/road/<place>`) that updates live.
- **Report something** — write it like you'd tell a friend. RoadCheck may ask
  up to three short follow-up questions (where exactly, did you see it
  yourself, how long ago, what exactly), shows what it understood, then posts.
- **I can confirm this / This isn't true** — builds each poster's track record,
  so reliable people count for more over time.

## Starter reports

`npm run seed` replaces the store with twelve reports from twelve people across
six roads, each filed through the real AI pipeline (reading, follow-up
questions, same-event check):

- **Kaduna-Zaria Junction** — a vague rumour (RoadCheck asks follow-ups), then
  someone who was there saw the same thing, then a trusted patrol drove through
  and found it clear → *Probably fine*
- **Kachia Road** — a bus driver, a passer-by and the local vigilance group all
  see kidnappers blocking the road within minutes → *Don't go that way*
- **Kawo Bridge** — a barricade seen firsthand, plus a neighbour's call → *Be careful*
- **Ahmadu Bello Way** — one 40-minute-old secondhand warning at a busy spot,
  nobody else mentions it → stays low
- **Central Market Road** — two new accounts post the same panic forward →
  counted once as suspicious
- **Kurmin Mashi farm road** — firsthand sighting at a quiet place

Times are relative to when the seed runs, and reports fade over about 30
minutes — run it again right before showing the app. `npm run test:ai` files
the same messages in memory and checks each road's outcome.

## What the model does (and doesn't)

| Job | Who does it |
|---|---|
| Read a report into place, time, what was seen, how they know | Open-weight model → keyword fallback |
| Ask follow-up questions like a dispatcher | Open-weight model → keyword fallback |
| Decide if two reports are the same event | Open-weight model → word-overlap fallback |
| Tag a new place as busy or quiet | Open-weight model → keyword fallback |
| Plain-language answer on the road page | Open-weight model → template fallback, guarded so it can't contradict the verdict |
| Danger level, hearsay discount, time decay, rumour chains, coordinated-account discount, silence on busy roads, contradiction collapse, track records | Belief engine in `lib/roadcheck.ts` — never the model |

The model is `qwen-3.8-27b` on Cerebras when `CEREBRAS_API_KEY` is set,
otherwise Llama 3.3 70B / 3.1 8B on Groq. Only open-weight models are used;
Claude, GPT, Gemini and Grok are refused even if configured. Details: [docs/FEATURES.md](docs/FEATURES.md).

## Developer checks

```bash
npm run test:engine   # belief model + no jargon reaches users
npm run test:ai       # starter reports through the real model, in memory only
npm run lint
npm run build
npm run ai:status     # with dev running: which model, is it answering
```

In development a small dashed panel at the bottom of the page shows which AI
jobs ran and whether they used the model or the fallback. It never appears in
production.

## Deploying

Any Node host with a persistent disk works (it's deployed on Railway):

- Build `npm run build`, start `npm run start`.
- Mount a volume and set `ROADCHECK_DATA_DIR` to it.
- Set `CEREBRAS_API_KEY` (or `GROQ_API_KEY`).
- `ROADCHECK_SEED_ON_START=1` files the starter reports when the store is empty.
- With `SEED_TOKEN` set, refresh them any time:
  `curl -X POST -H "Authorization: Bearer $SEED_TOKEN" https://<host>/api/seed`

## Limitations

- Reports are stored in one JSON file on the server. That's fine for one
  instance; more traffic needs a database — next step.
- No accounts: posters pick a nickname, so a track record can be impersonated.
- Places are matched by name, not GPS.
- Anyone can confirm or deny any report.
- Free/trial model tiers have rate limits; heavy use falls back to the keyword reader.
- A verdict is a best reading of what people report, not a guarantee.
