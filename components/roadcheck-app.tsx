"use client";

import { useEffect, useMemo, useState } from "react";
import {
  assignCluster,
  calculateRoadBelief,
  initialReports,
  initialSources,
  percent,
  roadName,
  roads,
  sourceReliability,
  updateSourceOutcome,
  type ExtractedClaim,
  type Report,
  type RoadBelief,
  type RoadId,
  type Source,
} from "@/lib/roadcheck";

type Tab = "monitor" | "report" | "sources";
type ReadBy = "model" | "rules";

type AnalysisResponse =
  | {
      needsFollowUp: true;
      question: string;
      readBy: ReadBy;
    }
  | {
      needsFollowUp: false;
      claim: ExtractedClaim;
      readBy: ReadBy;
    };

const demoReports = [
  {
    label: "Vague WhatsApp warning",
    value: "People are saying something is happening near the market. Be careful.",
  },
  {
    label: "Another copy of the voice note",
    value:
      "Forwarded message: the voice note says armed men are at the north junction on Market Road, about 25 minutes ago.",
  },
  {
    label: "Credible contradiction",
    value:
      "I drove the full length of Market Road myself two minutes ago. The junction and the road were clear.",
  },
];

const verdictStyle: Record<
  RoadBelief["verdict"],
  { text: string; wash: string; ring: string }
> = {
  "looks-clear": {
    text: "text-[#176346]",
    wash: "bg-[#e6f2eb]",
    ring: "#237a58",
  },
  unconfirmed: {
    text: "text-[#6c6258]",
    wash: "bg-[#eee8df]",
    ring: "#8a7a68",
  },
  caution: {
    text: "text-[#8a5a12]",
    wash: "bg-[#f8efd8]",
    ring: "#b8791d",
  },
  avoid: {
    text: "text-[#8d312c]",
    wash: "bg-[#f7e5e2]",
    ring: "#a84037",
  },
};

const eventLabel: Record<ExtractedClaim["eventType"], string> = {
  armed_people: "Armed people",
  road_block: "Road block",
  movement: "Movement",
  violence: "Violence",
  all_clear: "All clear",
  unknown: "Unspecified",
};

function Gauge({ belief }: { belief: RoadBelief }) {
  const style = verdictStyle[belief.verdict];
  const degrees = Math.round(belief.probability * 360);
  return (
    <div
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${style.ring} ${degrees}deg, rgba(28,22,18,.09) ${degrees}deg)`,
      }}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--paper)] text-xs font-bold">
        {percent(belief.probability)}
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger" | "safe" | "warn";
}) {
  const classes = {
    neutral: "bg-[#ede6dc] text-[#685e54]",
    danger: "bg-[#f4dedb] text-[#87352f]",
    safe: "bg-[#deeee5] text-[#176346]",
    warn: "bg-[#f5ead0] text-[#7a5015]",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

export function RoadCheckApp() {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [selectedRoad, setSelectedRoad] = useState<RoadId>("market-road");
  const [tab, setTab] = useState<Tab>("monitor");
  const [rawText, setRawText] = useState(demoReports[0].value);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pendingClaim, setPendingClaim] = useState<ExtractedClaim | null>(null);
  const [readBy, setReadBy] = useState<ReadBy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("roadcheck-session-v2");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        reports: Report[];
        sources: Source[];
      };
      if (parsed.reports?.length && parsed.sources?.length) {
        queueMicrotask(() => {
          setReports(parsed.reports);
          setSources(parsed.sources);
        });
      }
    } catch {
      window.localStorage.removeItem("roadcheck-session-v2");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "roadcheck-session-v2",
      JSON.stringify({ reports, sources }),
    );
  }, [reports, sources]);

  const beliefs = useMemo(
    () =>
      Object.fromEntries(
        roads.map((road) => [
          road.id,
          calculateRoadBelief(road.id, reports, sources),
        ]),
      ) as Record<RoadId, RoadBelief>,
    [reports, sources],
  );
  const selected = beliefs[selectedRoad];
  const selectedReports = reports
    .filter((report) => report.claim.roadId === selectedRoad)
    .sort((a, b) => a.claim.minutesAgo - b.claim.minutesAgo);

  async function analyze(withAnswer = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          answer: withAnswer ? answer : undefined,
        }),
      });
      const data = (await response.json()) as
        | AnalysisResponse
        | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "The report could not be read.");
        return;
      }
      setReadBy(data.readBy);
      if (data.needsFollowUp) {
        setFollowUp(data.question);
        setPendingClaim(null);
      } else {
        setFollowUp(null);
        setPendingClaim(data.claim);
        setSelectedRoad(data.claim.roadId);
      }
    } catch {
      setError("The report could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function addReport() {
    if (!pendingClaim) return;
    const sourceId = `src-${Date.now()}`;
    const source: Source = {
      id: sourceId,
      name: pendingClaim.reportedBy || "New reporter",
      channel:
        pendingClaim.epistemicStatus === "firsthand"
          ? "eyewitness"
          : "whatsapp",
      alpha: 2,
      beta: 2,
    };
    const report: Report = {
      id: `r-${Date.now()}`,
      rawText,
      sourceId,
      createdAt: "6:40 PM",
      claim: pendingClaim,
      clusterId: assignCluster(pendingClaim, reports),
      status: "open",
    };
    setSources((current) => [...current, source]);
    setReports((current) => [...current, report]);
    setPendingClaim(null);
    setFollowUp(null);
    setAnswer("");
    setRawText("");
    setTab("monitor");
  }

  function resolveReport(reportId: string, outcome: "confirmed" | "refuted") {
    const report = reports.find((item) => item.id === reportId);
    if (!report) return;
    setReports((current) =>
      current.map((item) =>
        item.id === reportId ? { ...item, status: outcome } : item,
      ),
    );
    setSources((current) =>
      current.map((source) =>
        source.id === report.sourceId
          ? updateSourceOutcome(source, outcome)
          : source,
      ),
    );
  }

  function resetDemo() {
    setReports(initialReports);
    setSources(initialSources);
    setSelectedRoad("market-road");
    setRawText(demoReports[0].value);
    setFollowUp(null);
    setPendingClaim(null);
    setAnswer("");
    setTab("monitor");
  }

  return (
    <div className="min-h-screen bg-[var(--dusk)] text-[var(--ink)]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.22em] text-[#e7c9a0]">
              ROADCHECK
            </p>
            <p className="mt-0.5 text-xs text-[#b9aa9a]">
              Kasuwa · 6:40 PM · demo evening
            </p>
          </div>
          <button
            onClick={resetDemo}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-[#e6dbcc] hover:bg-white/5"
          >
            Reset demo
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-5 max-w-3xl text-[var(--paper)]">
          <h1
            className="text-3xl leading-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Which road can Amara trust?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#cbbdad]">
            Raw reports become claims. Related forwards stay one chain. A
            transparent belief model decides; AI reads and asks, but never
            overrides the evidence.
          </p>
        </div>

        <nav className="mb-4 flex gap-1 rounded-2xl bg-black/15 p-1 sm:w-fit">
          {(
            [
              ["monitor", "Road monitor"],
              ["report", "Add a report"],
              ["sources", "Source ledger"],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                tab === id
                  ? "bg-[var(--paper)] text-[var(--ink)]"
                  : "text-[#cabdad] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "monitor" && (
          <div className="grid gap-4 lg:grid-cols-[0.88fr_1.55fr]">
            <section className="space-y-2">
              {roads.map((road) => {
                const belief = beliefs[road.id];
                const style = verdictStyle[belief.verdict];
                return (
                  <button
                    key={road.id}
                    onClick={() => setSelectedRoad(road.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      selectedRoad === road.id
                        ? "border-[#e7c9a0] bg-[var(--paper)] shadow-lg"
                        : "border-white/10 bg-white/[.06] text-[var(--paper)] hover:bg-white/[.09]"
                    }`}
                  >
                    <Gauge belief={belief} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold">{road.name}</h2>
                        <span className={`text-xs font-bold ${style.text}`}>
                          {belief.title}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-xs ${
                          selectedRoad === road.id
                            ? "text-[var(--muted)]"
                            : "text-[#b9aa9a]"
                        }`}
                      >
                        {road.detail}
                      </p>
                      <p
                        className={`mt-2 text-[11px] ${
                          selectedRoad === road.id
                            ? "text-[var(--muted)]"
                            : "text-[#b9aa9a]"
                        }`}
                      >
                        {belief.independentChains} evidence chain
                        {belief.independentChains === 1 ? "" : "s"}
                      </p>
                    </div>
                  </button>
                );
              })}
              <button
                onClick={() => setTab("report")}
                className="w-full rounded-2xl border border-dashed border-white/20 p-4 text-sm font-semibold text-[#dfd2c2] hover:bg-white/5"
              >
                + Add what you heard
              </button>
            </section>

            <section className="overflow-hidden rounded-[26px] bg-[var(--paper)] shadow-[0_20px_50px_rgba(0,0,0,.22)]">
              <div
                className={`border-b border-black/[.06] p-5 sm:p-6 ${verdictStyle[selected.verdict].wash}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.15em] text-[var(--muted)] uppercase">
                      {roadName(selectedRoad)} · right now
                    </p>
                    <h2
                      className={`mt-2 text-5xl leading-none ${verdictStyle[selected.verdict].text}`}
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {selected.title}
                    </h2>
                  </div>
                  <Gauge belief={selected} />
                </div>
                <p className="mt-4 max-w-2xl text-base leading-7">
                  {selected.explanation}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  A probability is a calibrated belief, not a guarantee.
                </p>
              </div>

              <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-bold tracking-[0.15em] text-[var(--muted)] uppercase">
                    Why the belief moved
                  </h3>
                  <ol className="mt-3 space-y-3">
                    {selected.evidence.length === 0 && (
                      <li className="text-sm text-[var(--muted)]">
                        No reports on this road yet.
                      </li>
                    )}
                    {selected.evidence.map((line) => (
                      <li
                        key={`${line.reportId}-${line.label}`}
                        className="flex gap-3"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            line.effect > 0 ? "bg-[#a84037]" : "bg-[#237a58]"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-semibold">{line.label}</p>
                          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
                            {line.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <h3 className="text-xs font-bold tracking-[0.15em] text-[var(--muted)] uppercase">
                    Reports on this road
                  </h3>
                  <div className="mt-3 space-y-2">
                    {selectedReports.length === 0 && (
                      <p className="text-sm text-[var(--muted)]">
                        No one has reported this road.
                      </p>
                    )}
                    {selectedReports.map((report) => {
                      const source = sources.find(
                        (item) => item.id === report.sourceId,
                      );
                      return (
                        <article
                          key={report.id}
                          className="rounded-2xl border border-[var(--line)] bg-white/60 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              tone={
                                report.claim.direction === "danger"
                                  ? "danger"
                                  : "safe"
                              }
                            >
                              {eventLabel[report.claim.eventType]}
                            </Badge>
                            <Badge>{report.claim.epistemicStatus}</Badge>
                            {report.status !== "open" && (
                              <Badge
                                tone={
                                  report.status === "confirmed"
                                    ? "safe"
                                    : "danger"
                                }
                              >
                                {report.status}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-5">
                            {report.claim.description}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {source?.name} · {report.claim.minutesAgo} min ago ·{" "}
                            {Math.round(report.claim.extractionConfidence * 100)}
                            % extraction confidence
                          </p>
                          {report.status === "open" && (
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() =>
                                  resolveReport(report.id, "confirmed")
                                }
                                className="text-xs font-semibold text-[#176346]"
                              >
                                Confirm true
                              </button>
                              <button
                                onClick={() =>
                                  resolveReport(report.id, "refuted")
                                }
                                className="text-xs font-semibold text-[#8d312c]"
                              >
                                Mark false
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "report" && (
          <section className="mx-auto max-w-3xl rounded-[26px] bg-[var(--paper)] p-5 shadow-[0_20px_50px_rgba(0,0,0,.22)] sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[var(--muted)] uppercase">
                  New report
                </p>
                <h2
                  className="mt-1 text-3xl"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Paste it as it reached you
                </h2>
              </div>
              <Badge tone={readBy === "model" ? "safe" : "neutral"}>
                {readBy === "model"
                  ? "AI reader active"
                  : readBy === "rules"
                    ? "Transparent fallback reader"
                    : "Waiting for report"}
              </Badge>
            </div>

            {!pendingClaim && (
              <>
                <textarea
                  value={rawText}
                  onChange={(event) => {
                    setRawText(event.target.value);
                    setFollowUp(null);
                    setAnswer("");
                  }}
                  rows={7}
                  className="mt-5 w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-4 text-base leading-7 outline-none focus:border-[#8a5a12]"
                  placeholder="Example: My cousin sent a voice note saying…"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {demoReports.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => {
                        setRawText(sample.value);
                        setFollowUp(null);
                        setAnswer("");
                      }}
                      className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>

                {followUp ? (
                  <div className="mt-5 rounded-2xl bg-[#f5ead0] p-4">
                    <p className="text-xs font-bold tracking-wide text-[#7a5015] uppercase">
                      One thing is missing
                    </p>
                    <p className="mt-1 font-semibold">{followUp}</p>
                    <input
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      className="mt-3 w-full rounded-xl border border-[#dcc99d] bg-white px-3 py-2.5 text-sm outline-none"
                      placeholder="Type the reporter's answer"
                    />
                    <button
                      onClick={() => void analyze(true)}
                      disabled={busy || answer.trim().length < 2}
                      className="mt-3 rounded-full bg-[var(--dusk)] px-4 py-2 text-xs font-bold text-[var(--paper)] disabled:opacity-50"
                    >
                      {busy ? "Reading…" : "Use this answer"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void analyze(false)}
                    disabled={busy || rawText.trim().length < 8}
                    className="mt-5 w-full rounded-full bg-[var(--dusk)] px-5 py-3 text-sm font-bold text-[var(--paper)] disabled:opacity-50"
                  >
                    {busy ? "Reading the report…" : "Read this report"}
                  </button>
                )}
              </>
            )}

            {pendingClaim && (
              <div className="mt-5 rounded-3xl border border-[var(--line)] bg-white p-5">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    tone={
                      pendingClaim.direction === "danger" ? "danger" : "safe"
                    }
                  >
                    {pendingClaim.direction}
                  </Badge>
                  <Badge>{pendingClaim.epistemicStatus}</Badge>
                  <Badge tone="warn">{pendingClaim.severity} severity</Badge>
                </div>
                <h3 className="mt-4 text-xl font-semibold">
                  {pendingClaim.description}
                </h3>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-[var(--muted)]">
                      Road
                    </dt>
                    <dd className="mt-1">{roadName(pendingClaim.roadId)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[var(--muted)]">
                      Reporter
                    </dt>
                    <dd className="mt-1">{pendingClaim.reportedBy}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[var(--muted)]">
                      Time
                    </dt>
                    <dd className="mt-1">
                      {pendingClaim.minutesAgo} minutes ago
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[var(--muted)]">
                      Extraction confidence
                    </dt>
                    <dd className="mt-1">
                      {percent(pendingClaim.extractionConfidence)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={addReport}
                    className="rounded-full bg-[var(--dusk)] px-5 py-2.5 text-sm font-bold text-[var(--paper)]"
                  >
                    Add to the road signal
                  </button>
                  <button
                    onClick={() => setPendingClaim(null)}
                    className="rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-[var(--stay)]">{error}</p>}
          </section>
        )}

        {tab === "sources" && (
          <section className="rounded-[26px] bg-[var(--paper)] p-5 shadow-[0_20px_50px_rgba(0,0,0,.22)] sm:p-7">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.16em] text-[var(--muted)] uppercase">
                Source reliability ledger
              </p>
              <h2
                className="mt-1 text-3xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Trust is earned from outcomes
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                New sources start in the middle. Confirmed reports improve their
                record; refuted reports reduce it. Identity can remain
                pseudonymous.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((source) => {
                const reliability = sourceReliability(source);
                const count = reports.filter(
                  (report) => report.sourceId === source.id,
                ).length;
                return (
                  <article
                    key={source.id}
                    className="rounded-2xl border border-[var(--line)] bg-white/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{source.name}</h3>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {source.channel} · {count} report{count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="text-xl font-bold">
                        {percent(reliability)}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e9e0d4]">
                      <div
                        className="h-full rounded-full bg-[#6e806d]"
                        style={{ width: percent(reliability) }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Beta({source.alpha}, {source.beta}) · updates only when a
                      claim is confirmed or refuted
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <p className="mt-4 max-w-3xl text-xs leading-5 text-[#a99b8c]">
          Prototype with fictional roads and reports. RoadCheck supports a
          decision; it does not guarantee safety or replace local emergency
          channels.
        </p>
      </main>
    </div>
  );
}
