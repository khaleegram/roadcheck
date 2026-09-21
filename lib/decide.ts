import {
  board,
  routeName,
  type Report,
  type RouteId,
} from "./board";

export type Kind = "sighting" | "all_clear" | "panic" | "hearsay" | "unclear";

export type Extraction = {
  claim: string;
  kind: Kind;
  routes: Array<RouteId | "town">;
  specific: boolean;
  source: "model" | "rehearsal";
  modelNote?: string;
};

export type Verdict = "go" | "wait" | "stay";

export type Decision = {
  verdict: Verdict;
  headline: string;
  rule: string;
  trust: "low" | "medium" | "high";
  trustWhy: string;
  claim: string;
  usedIds: string[];
};

const verdictCopy: Record<Verdict, string> = {
  go: "Go",
  wait: "Wait",
  stay: "Stay",
};

export { verdictCopy };

export function normalize(extraction: Extraction): Extraction {
  if (extraction.kind === "panic") {
    return { ...extraction, routes: ["town"], specific: false };
  }
  if (extraction.kind === "unclear") {
    return { ...extraction, specific: false };
  }
  return extraction;
}

function latest(reports: Report[], status: Report["status"]) {
  return [...reports].reverse().find((report) => report.status === status);
}

export function decide(route: RouteId, raw: Extraction): Decision {
  const extraction = normalize(raw);
  const name = routeName(route);
  const onRoute = board
    .filter((report) => report.route === route)
    .sort((a, b) => a.minutes - b.minutes);

  const confirmed = latest(onRoute, "confirmed");
  const unverified = latest(onRoute, "unverified");
  const cleared = latest(onRoute, "cleared");
  const rumour = latest(onRoute, "rumour");
  const clearAfterConfirm =
    confirmed != null &&
    onRoute.some(
      (report) =>
        report.status === "cleared" && report.minutes > confirmed.minutes,
    );
  const clearAfterUnverified =
    unverified != null &&
    onRoute.some(
      (report) =>
        report.status === "cleared" && report.minutes > unverified.minutes,
    );

  const aboutRoute = extraction.routes.includes(route);
  const newSighting =
    aboutRoute &&
    extraction.specific &&
    (extraction.kind === "sighting" || extraction.kind === "hearsay");

  const townClear = board.find(
    (report) => report.route === "town" && report.status === "cleared",
  );

  if (confirmed && !clearAfterConfirm) {
    return {
      verdict: "stay",
      headline: `Stay off ${name}. ${confirmed.summary} That was marked confirmed at ${confirmed.time}.`,
      rule: "A confirmed report stands until a later check clears that same road. A quiet window does not undo it.",
      trust: "high",
      trustWhy: `${confirmed.source} marked this confirmed. Clearpath is not allowed to confirm an incident on its own.`,
      claim: extraction.claim,
      usedIds: [confirmed.id],
    };
  }

  if (newSighting && unverified && !clearAfterUnverified) {
    const rumourLine = rumour
      ? " The “everyone run” forward is already marked as a rumour."
      : "";
    return {
      verdict: "wait",
      headline: `Wait in the shop. ${name} has one unchecked report, and this message is another telling of it.${rumourLine}`,
      rule: "One unchecked report means wait. A cousin, a forward, or a frightened group chat does not become a second witness.",
      trust: "low",
      trustWhy:
        "A single doorway sighting is still unchecked. The new message repeats it. It does not confirm it.",
      claim: extraction.claim,
      usedIds: [unverified.id, rumour?.id].filter((id): id is string =>
        Boolean(id),
      ),
    };
  }

  if (newSighting) {
    return {
      verdict: "wait",
      headline: `Wait. ${extraction.claim} No one else has reported ${name} tonight.`,
      rule: "One new sighting is a reason to pause. It is not a confirmed incident, and it is not a reason to send the street running.",
      trust: "low",
      trustWhy: "This rests on a single message. Nobody has checked it.",
      claim: extraction.claim,
      usedIds: [],
    };
  }

  if (cleared && (!unverified || clearAfterUnverified)) {
    const panicLine =
      extraction.kind === "panic" && townClear
        ? ` ${townClear.summary}`
        : "";
    return {
      verdict: "go",
      headline: `Go by ${name}. ${cleared.summary.replace(/\.$/, "")} at ${cleared.time}.${panicLine}`,
      rule: "A broad alarm does not close a road that was walked and found empty. A clearance counts only for the road it names.",
      trust: cleared.sources >= 2 ? "high" : "medium",
      trustWhy: `${cleared.source} checked this road. One walk is useful, and it is still only one walk.`,
      claim: extraction.claim,
      usedIds: [cleared.id, townClear && extraction.kind === "panic" ? townClear.id : ""]
        .filter(Boolean),
    };
  }

  if (onRoute.length === 0) {
    return {
      verdict: "wait",
      headline: `Wait. Nobody has checked ${name} tonight. Silence is not the same as safe.`,
      rule: "No report is not a clearance. Take a road someone has walked, or stay until one is.",
      trust: "low",
      trustWhy: `The board has nothing on ${name}. Clearpath will not invent a green light.`,
      claim: extraction.claim,
      usedIds: [],
    };
  }

  return {
    verdict: "wait",
    headline: `Wait. Nothing in that message clears ${name}, and an unchecked report is still open.`,
    rule: "Until someone walks the road, an open unchecked report means wait.",
    trust: "low",
    trustWhy: "The newest hard fact on this road is still unchecked.",
    claim: extraction.claim,
    usedIds: unverified ? [unverified.id] : [],
  };
}

export function rehearse(message: string): Extraction {
  const text = message.toLowerCase();
  const panic = /fire|burn|army|screaming|whole town|everyone run/.test(text);
  const hearsay = /cousin|whatsapp|voice note|forward|i heard|group/.test(text);
  const marketEvent =
    /market road|junction/.test(text) &&
    /armed|men|movement|coming|saw|seen/.test(text);
  const hillMention = /hill/.test(text);
  const riverEvent =
    /river/.test(text) && /clear|empty|patrol|walked|quiet|saw|headlight/.test(text);
  const allClear =
    /clear|empty|patrol|walked|quiet|no noise|looks fine|safe/.test(text) &&
    (hillMention || riverEvent || /market/.test(text));

  let kind: Kind = "unclear";
  const routes: Extraction["routes"] = [];

  if (panic && !marketEvent && !riverEvent) {
    kind = "panic";
    routes.push("town");
  } else if (marketEvent) {
    kind = hearsay ? "hearsay" : "sighting";
    routes.push("market");
  } else if (hillMention && allClear) {
    kind = "all_clear";
    routes.push("hill");
  } else if (hillMention) {
    kind = hearsay ? "hearsay" : "sighting";
    routes.push("hill");
  } else if (riverEvent && allClear) {
    kind = "all_clear";
    routes.push("river");
  } else if (riverEvent) {
    kind = "sighting";
    routes.push("river");
  }

  const specific = kind === "sighting" || kind === "hearsay" || kind === "all_clear";
  const claim = message.replace(/\s+/g, " ").trim().slice(0, 220);

  return {
    claim: claim || "The message is empty.",
    kind,
    routes,
    specific,
    source: "rehearsal",
  };
}
