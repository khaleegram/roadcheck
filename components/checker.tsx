"use client";

import { useState } from "react";
import {
  board,
  clock,
  routes,
  samples,
  statusLabel,
  type Report,
  type ReportStatus,
  type RouteId,
} from "@/lib/board";
import { verdictCopy, type Decision, type Kind, type Verdict } from "@/lib/decide";

type CheckResponse = {
  decision: Decision;
  readBy: "model" | "rehearsal";
  kind: Kind;
  board: Report[];
};

const wash: Record<Verdict, string> = {
  go: "bg-[var(--go-wash)] text-[var(--go)]",
  wait: "bg-[var(--wait-wash)] text-[var(--wait)]",
  stay: "bg-[var(--stay-wash)] text-[var(--stay)]",
};

const pip: Record<ReportStatus, string> = {
  confirmed: "bg-[var(--stay)]",
  unverified: "bg-[var(--wait)]",
  rumour: "bg-[#a89888]",
  cleared: "bg-[var(--go)]",
};

export function Checker() {
  const [message, setMessage] = useState(samples[0].message);
  const [route, setRoute] = useState<RouteId>(samples[0].route);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function check(nextMessage = message, nextRoute = route) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: nextMessage, route: nextRoute }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult(null);
        setError(data.error ?? "That check failed.");
        return;
      }
      setResult(data);
    } catch {
      setResult(null);
      setError("The check didn't go through. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const decision = result?.decision;
  const road = routes.find((item) => item.id === route);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-end justify-between gap-4 text-[var(--paper)]">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-[#e7c9a0]">CLEARPATH</p>
          <h1
            className="mt-2 max-w-xl text-4xl leading-none text-[var(--paper)] sm:text-5xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Is the road home safe?
          </h1>
        </div>
        <p className="shrink-0 text-right text-sm text-[#d9cbb8]">
          Kasuwa
          <br />
          {clock}
        </p>
      </header>

      <div className="rounded-[28px] bg-[var(--paper)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Amara is closing the shop. A cousin, a neighbour, and the radio are all talking.
          Paste what she just heard. Clearpath reads it against the board and answers with
          one word.
        </p>

        {decision && (
          <section
            aria-live="polite"
            className={`mt-5 rounded-3xl p-5 sm:p-6 ${wash[decision.verdict]}`}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.16em] uppercase">
                {road?.name} · right now
              </p>
              <p className="text-xs font-medium opacity-80">
                {result?.readBy === "model"
                  ? "The model read the message"
                  : "Rehearsal read — the model was unreachable, the rules still ran"}
              </p>
            </div>
            <p
              className="mt-1 text-6xl leading-none sm:text-7xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {verdictCopy[decision.verdict]}
            </p>
            <p className="mt-4 max-w-3xl text-lg leading-7">{decision.headline}</p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/55 p-3">
                <dt className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  The message says
                </dt>
                <dd className="mt-1 text-sm leading-6">{decision.claim}</dd>
              </div>
              <div className="rounded-2xl bg-white/55 p-3">
                <dt className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  The rule
                </dt>
                <dd className="mt-1 text-sm leading-6">{decision.rule}</dd>
              </div>
              <div className="rounded-2xl bg-white/55 p-3">
                <dt className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  Trust · {decision.trust}
                </dt>
                <dd className="mt-1 text-sm leading-6">{decision.trustWhy}</dd>
              </div>
            </dl>
          </section>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void check();
            }}
          >
            <label className="flex flex-col gap-2 text-sm font-medium">
              What did you hear?
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                required
                className="resize-y rounded-2xl border border-[var(--line)] bg-white px-3 py-3 text-base leading-6 font-normal outline-none focus:border-[#8a5a12]"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium">Which road home?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {routes.map((item) => {
                  const selected = item.id === route;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRoute(item.id)}
                      className={`rounded-2xl border px-3 py-3 text-left ${
                        selected
                          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                          : "border-[var(--line)] bg-white"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{item.name}</span>
                      <span
                        className={`mt-1 block text-xs leading-5 ${
                          selected ? "text-[#d9cbb8]" : "text-[var(--muted)]"
                        }`}
                      >
                        {item.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              {samples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={() => {
                    setMessage(sample.message);
                    setRoute(sample.route);
                    void check(sample.message, sample.route);
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-[var(--stay)]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[var(--dusk)] px-5 py-3 text-sm font-semibold text-[var(--paper)] disabled:opacity-60"
            >
              {loading ? "Reading the message…" : "Check this road"}
            </button>
          </form>

          <aside>
            <h2 className="text-sm font-semibold">Signal board · this evening</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              People filed these. The model can read them. It cannot mark one confirmed.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {board.map((report) => {
                const used = decision?.usedIds.includes(report.id);
                return (
                  <li
                    key={report.id}
                    className={`rounded-2xl border px-3 py-3 ${
                      used
                        ? "border-[var(--ink)] bg-white"
                        : "border-[var(--line)] bg-white/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold">{report.time}</span>
                      <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
                        <span className={`h-2 w-2 rounded-full ${pip[report.status]}`} />
                        {statusLabel[report.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6">{report.summary}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{report.source}</p>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-5 text-[#b7aa9c]">
        Kasuwa is a fictional evening for this prototype. Clearpath is not an official
        alert system. If you are in danger, use the channel your community already trusts.
      </p>
    </div>
  );
}
