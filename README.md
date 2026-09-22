# Is the road home safe?

Amara is closing the shop at 6:40 PM. A cousin's voice note is moving through WhatsApp. A neighbour saw movement on the road. The vigilante radio has not reached her.

She pastes only the messages that have reached her. Each message becomes a claim: who spoke, whether they were there, and which story it belongs to. Forwards of the same voice note stay one chain. The neighbour who saw it is a second chain.

The road stays unresolved until someone who is not in those chains was physically on it after the last claim. Time passing does not clear it. Talk about the radio does not clear it, because the radio has not reached her.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The check runs on the rules if the model cannot be reached, and the screen says so. On Vercel the model goes through AI Gateway. That gateway asks for a card on the account before it will use the free credits. Add one in the Vercel AI settings, then reload.

Optional: `CLEARPATH_MODEL` (default `openai/gpt-5.4-mini`). `CLEARPATH_REHEARSAL=1` forces the rules path.

```bash
npx tsx scripts/rules-check.ts
npm run build
```
