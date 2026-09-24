"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateRoadBelief,
  findLocation,
  locationIdFromName,
  minutesSince,
  type EpistemicStatus,
  type ExtractedClaim,
  type Location,
  type Report,
  type RoadBelief,
  type Source,
} from "@/lib/roadcheck";

type Screen = "home" | "road" | "share" | "people";
type ReadBy = "model" | "rules";
type Turn = { question: string; answer: string };

type AnalysisResponse =
  | { needsFollowUp: true; question: string; readBy: ReadBy; aiNote?: string | null }
  | {
      needsFollowUp: false;
      claim: ExtractedClaim;
      placeIsBusy: boolean;
      readBy: ReadBy;
      aiNote?: string | null;
    };

type DevEvent = { at: number; job: string; readBy: ReadBy; note: string | null };

const verdictLook: Record<
  RoadBelief["verdict"],
  { headline: string; short: string; bg: string; color: string }
> = {
  "looks-clear": {
    headline: "Probably fine",
    short: "Looks fine",
    bg: "var(--ok-bg)",
    color: "var(--ok)",
  },
  unconfirmed: {
    headline: "Nobody knows yet",
    short: "Unclear",
    bg: "var(--unknown-bg)",
    color: "var(--muted)",
  },
  caution: {
    headline: "Be careful",
    short: "Be careful",
    bg: "var(--wait-bg)",
    color: "var(--wait)",
  },
  avoid: {
    headline: "Don't go that way",
    short: "Avoid",
    bg: "var(--bad-bg)",
    color: "var(--bad)",
  },
};

const howTheyKnow: Record<EpistemicStatus, string> = {
  firsthand: "Saw it themselves",
  secondhand: "Heard it from someone",
  thirdhand: "Forwarded message",
  unknown: "Not sure how they know",
};

const POLL_MS = 20_000;
const IS_DEV = process.env.NODE_ENV === "development";

function timeAgo(minutes: number) {
  const m = Math.round(minutes);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function titleFromId(id: string) {
  return id
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RoadCheckApp({
  initialRoadId,
  initialRoadName,
}: {
  initialRoadId?: string;
  initialRoadName?: string;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>(initialRoadId ? "road" : "home");
  const [query, setQuery] = useState("");
  const [handle, setHandle] = useState("");
  const [rawText, setRawText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState<{
    claim: ExtractedClaim;
    placeIsBusy: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [why, setWhy] = useState<Record<string, string>>({});
  const [voted, setVoted] = useState<Record<string, true>>({});
  const [copied, setCopied] = useState(false);
  const [devLog, setDevLog] = useState<DevEvent[]>([]);

  const logDev = useCallback((job: string, readBy: ReadBy, note?: string | null) => {
    if (!IS_DEV) return;
    setDevLog((log) => [{ at: Date.now(), job, readBy, note: note ?? null }, ...log].slice(0, 12));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/feed", { cache: "no-store" });
    const data = (await response.json()) as {
      locations: Location[];
      reports: Report[];
      sources: Source[];
    };
    setLocations(data.locations);
    setReports(data.reports);
    setSources(data.sources);
    setLoaded(true);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh().catch(() => setError("Couldn't load the latest reports. Check your connection."));
    });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const road: Location | null = useMemo(() => {
    if (!initialRoadId) return null;
    return (
      locations.find((item) => item.id === initialRoadId) ?? {
        id: initialRoadId,
        name: initialRoadName?.trim() || titleFromId(initialRoadId),
        busy: true,
      }
    );
  }, [initialRoadId, initialRoadName, locations]);

  const belief = road ? calculateRoadBelief(road, reports, sources) : null;
  const roadReports = road
    ? reports
        .filter((report) => report.claim.locationId === road.id)
        .sort((a, b) => minutesSince(a.occurredAt) - minutesSince(b.occurredAt))
    : [];
  const whyKey = belief
    ? `${belief.locationId}:${belief.verdict}:${roadReports.map((r) => `${r.id}${r.status}`).join(",")}`
    : "";

  useEffect(() => {
    if (!loaded || !road || !whyKey || why[whyKey]) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationId: road.id, locationName: road.name }),
        });
        const data = (await response.json()) as {
          sentence?: string;
          readBy?: ReadBy;
          aiNote?: string | null;
        };
        if (cancelled || !data.sentence) return;
        setWhy((current) => ({ ...current, [whyKey]: data.sentence! }));
        logDev("plain answer", data.readBy ?? "rules", data.aiNote);
      } catch {
        /* the built-in sentence stays */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, road, whyKey, why, logDev]);

  const watched = useMemo(() => {
    return locations
      .map((location) => {
        const b = calculateRoadBelief(location, reports, sources);
        const latest = reports
          .filter((report) => report.claim.locationId === location.id)
          .map((report) => minutesSince(report.occurredAt))
          .sort((a, b) => a - b)[0];
        return { location, belief: b, latest: latest ?? Infinity };
      })
      .filter((item) => Number.isFinite(item.latest))
      .sort((a, b) => a.latest - b.latest);
  }, [locations, reports, sources]);

  function goToRoad(location: { id: string; name: string }) {
    router.push(`/road/${location.id}?name=${encodeURIComponent(location.name)}`);
  }

  function checkRoad() {
    const name = query.trim();
    if (!name) return;
    const found = findLocation(name, locations);
    goToRoad(found ?? { id: locationIdFromName(name), name });
  }

  function openShare() {
    setError("");
    setTurns([]);
    setQuestion(null);
    setAnswer("");
    setPending(null);
    setScreen("share");
  }

  async function analyze(nextTurns: Turn[]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          turns: nextTurns,
          contextPlace: road?.name,
          locations: road && !locations.some((l) => l.id === road.id)
            ? [...locations, road]
            : locations,
        }),
      });
      const data = (await response.json()) as AnalysisResponse | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "We couldn't read that. Try again.");
        return;
      }
      logDev("read report", data.readBy, data.aiNote);
      if (data.needsFollowUp) {
        setQuestion(data.question);
        setPending(null);
        return;
      }
      setQuestion(null);
      setPending({ claim: data.claim, placeIsBusy: data.placeIsBusy });
    } catch {
      setError("We couldn't reach RoadCheck. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function sendAnswer(skip = false) {
    if (!question) return;
    const next = [...turns, { question, answer: skip ? "" : answer.trim() }];
    setTurns(next);
    setAnswer("");
    setQuestion(null);
    void analyze(next);
  }

  async function publish() {
    if (!pending) return;
    if (handle.trim().length < 2) {
      setError("Add a name or nickname so people know who posted it.");
      return;
    }
    setBusy(true);
    setError("");
    const fullText = [
      rawText,
      ...turns.filter((t) => t.answer).map((t) => `${t.question} ${t.answer}`),
    ].join("\n");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: fullText,
          handle: handle.trim(),
          claim: pending.claim,
          placeIsBusy: pending.placeIsBusy,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That didn't post. Try again.");
        return;
      }
      const target = { id: pending.claim.locationId, name: pending.claim.locationName };
      setRawText("");
      setTurns([]);
      setPending(null);
      await refresh();
      if (road?.id === target.id) setScreen("road");
      else goToRoad(target);
    } catch {
      setError("That didn't post. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function vote(reportId: string, outcome: "confirmed" | "refuted") {
    setVoted((current) => ({ ...current, [reportId]: true }));
    await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, outcome }),
    });
    await refresh();
  }

  async function shareRoad() {
    if (!road || !belief) return;
    const url = window.location.href;
    const text = `${road.name}: ${verdictLook[belief.verdict].headline}. ${why[whyKey] ?? belief.explanation}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `RoadCheck — ${road.name}`, text, url });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const look = belief ? verdictLook[belief.verdict] : null;
  const latestMinutes = roadReports.length
    ? minutesSince(roadReports[0].occurredAt)
    : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-6">
      <header className="mb-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (initialRoadId ? router.push("/") : setScreen("home"))}
          className="text-lg font-semibold tracking-tight"
        >
          RoadCheck
        </button>
        {screen !== "share" && (
          <button
            type="button"
            onClick={openShare}
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium"
          >
            Report something
          </button>
        )}
      </header>

      <main className="flex-1">
        {screen === "home" && (
          <>
            <h1 className="text-2xl font-bold leading-tight">
              Is the road safe right now?
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              See what people nearby are reporting before you go.
            </p>
            <form
              className="mt-6"
              onSubmit={(event) => {
                event.preventDefault();
                checkRoad();
              }}
            >
              <label className="sr-only" htmlFor="road">
                Road or area
              </label>
              <input
                id="road"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Road, junction or area"
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-4 py-3.5 text-base shadow-sm outline-none focus:border-[var(--brand)]"
                autoComplete="off"
                list="known-roads"
              />
              <datalist id="known-roads">
                {locations.map((location) => (
                  <option key={location.id} value={location.name} />
                ))}
              </datalist>
              <button
                type="submit"
                disabled={!query.trim()}
                className="mt-3 w-full rounded-lg bg-[var(--brand)] py-3.5 text-base font-semibold text-white disabled:opacity-40"
              >
                Check
              </button>
            </form>

            <section className="mt-10">
              <h2 className="text-sm font-semibold">Recently reported</h2>
              {!loaded ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
              ) : watched.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Nothing reported yet. If you&apos;ve seen or heard something,
                  share it so others can decide.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--card)]">
                  {watched.map(({ location, belief: b, latest }) => {
                    const v = verdictLook[b.verdict];
                    return (
                      <li key={location.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                          onClick={() => goToRoad(location)}
                        >
                          <span>
                            <span className="block font-medium">{location.name}</span>
                            <span className="text-xs text-[var(--muted)]">
                              Last report {timeAgo(latest)}
                            </span>
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={{ background: v.bg, color: v.color }}
                          >
                            {v.short}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <button
              type="button"
              onClick={() => setScreen("people")}
              className="mt-8 block w-full text-center text-xs text-[var(--muted)] underline-offset-2 hover:underline"
            >
              Who&apos;s been reliable?
            </button>
          </>
        )}

        {screen === "road" && !loaded && (
          <p className="text-sm text-[var(--muted)]">Getting the latest reports…</p>
        )}

        {screen === "road" && loaded && road && belief && look && (
          <>
            <div
              className="rounded-xl p-5"
              style={{ background: look.bg }}
            >
              <p className="text-sm font-medium text-[var(--muted)]">{road.name}</p>
              <h1
                className="mt-1 text-3xl font-bold leading-tight"
                style={{ color: look.color }}
              >
                {look.headline}
              </h1>
              <p className="mt-3 text-base leading-relaxed">
                {why[whyKey] ?? belief.explanation}
              </p>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {roadReports.length === 0
                  ? "No reports yet"
                  : `${roadReports.length} report${roadReports.length === 1 ? "" : "s"} · latest ${timeAgo(latestMinutes ?? 0)}`}
                {" · updates live"}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={openShare}
                className="flex-1 rounded-lg bg-[var(--brand)] py-3 text-sm font-semibold text-white"
              >
                I know something
              </button>
              <button
                type="button"
                onClick={() => void shareRoad()}
                className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm font-medium"
              >
                {copied ? "Copied" : "Send to someone"}
              </button>
            </div>

            <section className="mt-8">
              <h2 className="text-sm font-semibold">What people are saying</h2>
              {roadReports.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  No one has reported anything here yet. If you&apos;ve just
                  come from {road.name}, tell others what it&apos;s like.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {roadReports.map((report) => {
                    const source = sources.find((item) => item.id === report.sourceId);
                    const record = source
                      ? { right: source.alpha - 2, wrong: source.beta - 2 }
                      : null;
                    return (
                      <li
                        key={report.id}
                        className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-4 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                          <span className="font-medium text-[var(--ink)]">
                            {source?.name ?? "Someone"}
                          </span>
                          <span>{timeAgo(minutesSince(report.occurredAt))}</span>
                        </div>
                        <p className="mt-2 leading-relaxed">
                          {report.claim.whatWasSeen || report.claim.description}
                        </p>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          {howTheyKnow[report.claim.epistemicStatus]}
                          {record && (record.right > 0 || record.wrong > 0)
                            ? ` · right ${record.right}×, wrong ${record.wrong}× before`
                            : ""}
                        </p>
                        {report.status === "open" && !voted[report.id] && (
                          <div className="mt-3 flex gap-4 text-xs font-medium">
                            <button
                              type="button"
                              className="text-[var(--ok)]"
                              onClick={() => void vote(report.id, "confirmed")}
                            >
                              I can confirm this
                            </button>
                            <button
                              type="button"
                              className="text-[var(--bad)]"
                              onClick={() => void vote(report.id, "refuted")}
                            >
                              This isn&apos;t true
                            </button>
                          </div>
                        )}
                        {report.status !== "open" && (
                          <p
                            className="mt-3 text-xs font-medium"
                            style={{
                              color:
                                report.status === "confirmed" ? "var(--ok)" : "var(--bad)",
                            }}
                          >
                            {report.status === "confirmed"
                              ? "Confirmed by someone else"
                              : "Someone said this wasn't true"}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {belief.evidence.length > 0 && (
              <details className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--card)] p-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  How we decided
                </summary>
                <ul className="mt-3 space-y-2 text-[var(--muted)]">
                  {belief.evidence.map((line) => (
                    <li key={`${line.reportId}-${line.kind}`} className="flex gap-2">
                      <span aria-hidden style={{ color: line.effect > 0 ? "var(--bad)" : "var(--ok)" }}>
                        {line.effect > 0 ? "▲" : "▼"}
                      </span>
                      <span>{line.plain}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  People who saw it themselves count more than forwards. Older
                  reports count less. The same story passed around counts once.
                </p>
              </details>
            )}

            <p className="mt-6 text-center text-xs text-[var(--muted)]">
              This is what people are reporting, not a guarantee. Stay alert.
            </p>
          </>
        )}

        {screen === "share" && (
          <>
            <button
              type="button"
              onClick={() => setScreen(initialRoadId ? "road" : "home")}
              className="mb-4 text-sm text-[var(--brand)]"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold">What did you see or hear?</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Write it the way you&apos;d tell a friend, or paste the message you
              got. Say where, and whether you saw it yourself.
            </p>

            {!pending && turns.length === 0 && !question && (
              <>
                <textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  rows={5}
                  className="mt-5 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--card)] p-4 text-base leading-relaxed"
                  placeholder={
                    road
                      ? `e.g. Just passed ${road.name}, everything calm.`
                      : "e.g. I just passed the market junction, men with guns near the filling station."
                  }
                  autoFocus
                />
                <button
                  type="button"
                  disabled={busy || rawText.trim().length < 8}
                  onClick={() => void analyze([])}
                  className="mt-3 w-full rounded-lg bg-[var(--brand)] py-3.5 font-semibold text-white disabled:opacity-40"
                >
                  {busy ? "Reading…" : "Next"}
                </button>
              </>
            )}

            {(turns.length > 0 || question) && (
              <div className="mt-5 space-y-3">
                <p className="rounded-lg bg-[var(--card)] p-3 text-sm ring-1 ring-[var(--line)]">
                  {rawText}
                </p>
                {turns.map((turn, index) => (
                  <div key={index} className="space-y-2">
                    <p className="mr-10 rounded-lg bg-[var(--wait-bg)] p-3 text-sm">
                      {turn.question}
                    </p>
                    <p className="ml-10 rounded-lg bg-[var(--card)] p-3 text-sm ring-1 ring-[var(--line)]">
                      {turn.answer || <span className="text-[var(--muted)]">Not sure</span>}
                    </p>
                  </div>
                ))}
                {question && (
                  <div className="space-y-2">
                    <p className="mr-10 rounded-lg bg-[var(--wait-bg)] p-3 text-sm font-medium">
                      {question}
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (answer.trim()) sendAnswer();
                      }}
                    >
                      <input
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-base"
                        placeholder="Your answer"
                        autoFocus
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="submit"
                          disabled={busy || !answer.trim()}
                          className="flex-1 rounded-lg bg-[var(--brand)] py-3 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          Answer
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => sendAnswer(true)}
                          className="rounded-lg border border-[var(--line)] px-4 py-3 text-sm"
                        >
                          I don&apos;t know
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                {busy && !question && (
                  <p className="text-sm text-[var(--muted)]">Reading…</p>
                )}
              </div>
            )}

            {pending && (
              <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--card)] p-4">
                <p className="text-sm text-[var(--muted)]">Here&apos;s what we&apos;ll post:</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Where</dt>
                    <dd className="font-medium">{pending.claim.locationName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">What</dt>
                    <dd>{pending.claim.whatWasSeen || pending.claim.description}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">When</dt>
                    <dd>
                      {pending.claim.timeReference ||
                        timeAgo(pending.claim.minutesAgo)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">How you know</dt>
                    <dd>
                      {pending.claim.reporterRelationship ||
                        howTheyKnow[pending.claim.epistemicStatus]}
                    </dd>
                  </div>
                </dl>

                <label className="mt-4 block text-sm font-medium" htmlFor="handle">
                  Your name or nickname
                </label>
                <input
                  id="handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-base"
                  placeholder="Use the same one each time"
                  autoComplete="nickname"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  When your reports turn out right, people trust them more.
                </p>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void publish()}
                    className="flex-1 rounded-lg bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? "Posting…" : "Post it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null);
                      setTurns([]);
                      setQuestion(null);
                    }}
                    className="rounded-lg border border-[var(--line)] px-4 py-3 text-sm"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-[var(--bad)]">{error}</p>}
          </>
        )}

        {screen === "people" && (
          <>
            <button
              type="button"
              onClick={() => setScreen("home")}
              className="mb-4 text-sm text-[var(--brand)]"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold">Who&apos;s been reliable?</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              When others confirm or deny a report, the person who posted it
              gets a track record. Reports from people who are usually right
              count for more.
            </p>
            {sources.length === 0 ? (
              <p className="mt-8 text-sm text-[var(--muted)]">No one has posted yet.</p>
            ) : (
              <ul className="mt-6 space-y-3">
                {[...sources]
                  .sort((a, b) => b.alpha - b.beta - (a.alpha - a.beta))
                  .map((source) => {
                    const count = reports.filter((r) => r.sourceId === source.id).length;
                    const right = source.alpha - 2;
                    const wrong = source.beta - 2;
                    return (
                      <li
                        key={source.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card)] px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{source.name}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {count} report{count === 1 ? "" : "s"}
                          </p>
                        </div>
                        <p className="text-right text-xs text-[var(--muted)]">
                          {right === 0 && wrong === 0
                            ? "New — no track record yet"
                            : `Right ${right}× · Wrong ${wrong}×`}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            )}
          </>
        )}

        {error && screen !== "share" && (
          <p className="mt-4 text-sm text-[var(--bad)]">{error}</p>
        )}
      </main>

      {IS_DEV && <DevPanel log={devLog} />}
    </div>
  );
}

/** Development-only view of which AI jobs ran. Never shown in production. */
function DevPanel({ log }: { log: DevEvent[] }) {
  const [status, setStatus] = useState<{
    mode: string;
    model: string;
    probe?: { ok: boolean; error?: string };
  } | null>(null);

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <details className="mt-10 rounded-lg border border-dashed border-[var(--line)] p-3 font-mono text-[11px] text-[var(--muted)]">
      <summary className="cursor-pointer">
        dev · AI {status?.probe?.ok ? `live (${status.model})` : `off — ${status?.probe?.error ?? "checking…"}`}
      </summary>
      <ul className="mt-2 space-y-1">
        {log.length === 0 && <li>no AI calls yet</li>}
        {log.map((event) => (
          <li key={event.at + event.job}>
            {new Date(event.at).toLocaleTimeString()} · {event.job} ·{" "}
            <span style={{ color: event.readBy === "model" ? "var(--ok)" : "var(--bad)" }}>
              {event.readBy}
            </span>
            {event.note ? ` · ${event.note}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}
