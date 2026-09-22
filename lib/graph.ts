export type Role = "saw" | "heard" | "passed";

export type Claim = {
  speaker: string;
  road: string;
  role: Role;
  story: string;
  minutesAgo: number | null;
  radio: boolean;
  text: string;
};

export type Read = {
  claims: Claim[];
  source: "model" | "rehearsal";
};

export type Chain = {
  story: string;
  road: string;
  role: Role;
  speakers: string[];
  minutesAgo: number | null;
  radio: boolean;
  text: string;
};

export type RoadAnswer = {
  road: string;
  verdict: "go" | "wait";
  headline: string;
  chains: Chain[];
  radioNote: string;
  ask: string | null;
};

const reachedHer = `Twenty minutes ago my cousin sent a voice note. He heard there is movement on the road home. He did not see it.

The WhatsApp group is forwarding that same voice note. People are saying lock up and run.

Ten minutes ago the neighbour saw movement on the road home. She was at her door.`;

export const samples = [
  {
    id: "reached",
    label: "What reached her",
    text: reachedHer,
  },
  {
    id: "radio",
    label: "Someone mentions the radio",
    text: `${reachedHer}

Someone in the group says the vigilante radio said the road home is fine.`,
  },
  {
    id: "earlier",
    label: "A walk from before",
    text: `${reachedHer}

Forty minutes ago my brother walked the road home. It was empty.`,
  },
  {
    id: "after",
    label: "Someone walked it after",
    text: `${reachedHer}

Two minutes ago my brother walked the road home himself. It was empty. He did not hear this from my cousin or the neighbour.`,
  },
];

function speakerOf(text: string) {
  const t = text.toLowerCase();
  if (/my brother|brother walked/.test(t)) return "Brother";
  if (/radio|vigilante/.test(t)) return "Someone talking about the radio";
  if (/neighbour saw|neighbor saw|the neighbour saw/.test(t)) return "Neighbour";
  if (/my cousin/.test(t)) return "Cousin";
  if (/whatsapp group|the group is forwarding/.test(t)) return "WhatsApp group";
  return "Someone";
}

function minutesOf(text: string) {
  const word: Record<string, number> = {
    two: 2,
    ten: 10,
    twenty: 20,
    forty: 40,
  };
  const numeric = text.match(/(\d+)\s*minutes?\s*ago/i);
  if (numeric) return Number(numeric[1]);
  const named = text.toLowerCase().match(/\b(two|ten|twenty|forty)\s+minutes?\s+ago/);
  if (named) return word[named[1]];
  return null;
}

export function rehearseMessage(text: string): Claim {
  const t = text.toLowerCase();
  const radio = /radio|vigilante/.test(t);
  const passed =
    /walked the road|drove through|was on the road|walked it/.test(t) && !radio;
  const saw =
    /neighbour|neighbor/.test(t) && /saw|seen/.test(t) && !radio && !passed;
  const cousinStory = /cousin|voice note|forward|same voice|group/.test(t);

  let role: Role = "heard";
  let story = "unplaced";
  if (passed) {
    role = "passed";
    story = "own-passage";
  } else if (saw) {
    role = "saw";
    story = "neighbour-saw";
  } else if (radio) {
    role = "heard";
    story = "radio-talk";
  } else if (cousinStory) {
    role = "heard";
    story = "cousin-voice-note";
  }

  return {
    speaker: speakerOf(text),
    road: "the road home",
    role,
    story,
    minutesAgo: minutesOf(text),
    radio,
    text: text.replace(/\s+/g, " ").trim(),
  };
}

export function rehearse(messages: string[]): Read {
  return {
    claims: messages.map((message) => rehearseMessage(message)).filter((claim) => claim.text.length > 0),
    source: "rehearsal",
  };
}

export function splitMessages(raw: string) {
  return raw
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function chainOf(claims: Claim[]): Chain {
  const times = claims
    .map((claim) => claim.minutesAgo)
    .filter((minutes): minutes is number => minutes != null);
  const saw = claims.some((claim) => claim.role === "saw");
  const passed = claims.some((claim) => claim.role === "passed");
  return {
    story: claims[0].story,
    road: claims[0].road,
    role: saw ? "saw" : passed ? "passed" : "heard",
    speakers: [...new Set(claims.map((claim) => claim.speaker))],
    minutesAgo: times.length ? Math.min(...times) : null,
    radio: claims.every((claim) => claim.radio),
    text: claims[0].text,
  };
}

export function judge(claims: Claim[]): RoadAnswer[] {
  const roads = [...new Set(claims.map((claim) => claim.road))];
  return roads.map((road) => {
    const onRoad = claims.filter((claim) => claim.road === road);
    const grouped = new Map<string, Claim[]>();
    for (const claim of onRoad) {
      const bucket = grouped.get(claim.story) ?? [];
      bucket.push(claim);
      grouped.set(claim.story, bucket);
    }
    const chains = [...grouped.values()].map((group) => chainOf(group));
    const danger = chains.filter((chain) => chain.role === "saw" || chain.role === "heard");
    const passages = chains.filter((chain) => chain.role === "passed" && !chain.radio);
    const radioMentioned = onRoad.some((claim) => claim.radio);
    const timesKnown = danger.every((chain) => chain.minutesAgo != null);
    const latestDanger = timesKnown
      ? Math.min(...danger.map((chain) => chain.minutesAgo as number))
      : null;
    const clearing = passages.find((chain) => {
      if (chain.minutesAgo == null || latestDanger == null) return false;
      return chain.minutesAgo < latestDanger;
    });

    const radioNote = radioMentioned
      ? "Someone mentioned the vigilante radio. That radio has not reached you, so it is not evidence."
      : "The vigilante radio has not reached you. It is not part of this.";

    if (danger.length === 0 && passages.length > 0) {
      return {
        road,
        verdict: "go" as const,
        headline: `Go. ${passages[0].speakers[0]} was on ${road} and said it was empty. Nothing in these messages says otherwise.`,
        chains,
        radioNote,
        ask: null,
      };
    }

    if (clearing) {
      return {
        road,
        verdict: "go" as const,
        headline: `Go. ${clearing.speakers[0]} was on ${road} ${clearing.minutesAgo} minutes ago, after the last claim, and is not part of that chain.`,
        chains,
        radioNote,
        ask: null,
      };
    }

    const saw = danger.find((chain) => chain.role === "saw");
    const heard = danger.find((chain) => chain.role === "heard" && !chain.radio);
    const ask = saw
      ? `Send to your ${saw.speakers[0].toLowerCase()}: You saw movement on the road. Are they still there, and which way were they heading?`
      : heard
        ? `Send to your ${heard.speakers[0].toLowerCase()}: Did you see it yourself, or did you hear it? Where on the road, and when?`
        : null;

    const why = saw
      ? `${saw.speakers[0]} was there and saw movement. ${
          heard
            ? `${heard.speakers.join(" and ")} are another chain, passing it on.`
            : "The other messages do not add a person who was there."
        }`
      : "These messages are one chain of people passing it on. Nobody in them was on the road.";

    return {
      road,
      verdict: "wait" as const,
      headline: `Wait. Stay off ${road}. ${why} Nobody else was on it after that. Time passing does not clear it.`,
      chains,
      radioNote,
      ask,
    };
  });
}
