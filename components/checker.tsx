"use client";

import { useState } from "react";
import { samples, type Chain, type RoadAnswer } from "@/lib/graph";

type CheckResponse = {
  roads: RoadAnswer[];
  readBy: "model" | "rehearsal";
};

const roleLabel: Record<Chain["role"], string> = {
  saw: "Was there",
  heard: "Passed it on",
  passed: "Was on the road",
};

export function Checker() {
  const [text, setText] = useState(samples[0].text);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function check(next = text) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
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

  const answer = result?.roads[0];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 text-[var(--paper)]">
        <p className="text-sm text-[#d9cbb8]">6:40 PM</p>
        <h1
          className="mt-2 max-w-xl text-4xl leading-none sm:text-5xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Is the road home safe?
        </h1>
      </header>

      <div className="rounded-[28px] bg-[var(--paper)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Paste only what has already reached her. A cousin on WhatsApp and a neighbour
          at the door count. The vigilante radio has not reached her, so talk about it
          does not clear the road.
        </p>

        {answer && (
          <section
            aria-live="polite"
            className={`mt-5 rounded-3xl p-5 sm:p-6 ${
              answer.verdict === "go"
                ? "bg-[var(--go-wash)] text-[var(--go)]"
                : "bg-[var(--wait-wash)] text-[var(--wait)]"
            }`}
          >
            <p className="text-xs font-semibold tracking-[0.16em] uppercase">
              {answer.road}
              {result?.readBy === "model" ? " · the model read the messages" : " · rules read the messages"}
            </p>
            <p
              className="mt-1 text-6xl leading-none sm:text-7xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {answer.verdict === "go" ? "Go" : "Wait"}
            </p>
            <p className="mt-4 max-w-3xl text-lg leading-7">{answer.headline}</p>
            <p className="mt-3 text-sm leading-6">{answer.radioNote}</p>
            {answer.ask && (
              <p className="mt-3 rounded-2xl bg-white/55 p-3 text-sm leading-6">{answer.ask}</p>
            )}
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {answer.chains.map((chain) => (
                <li key={chain.story} className="rounded-2xl bg-white/55 p-3 text-sm leading-6">
                  <span className="font-semibold">{roleLabel[chain.role]}</span>
                  <span className="mt-1 block">
                    {chain.speakers.join(", ")}
                    {chain.minutesAgo != null ? ` · ${chain.minutesAgo} min ago` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void check();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-medium">
            What reached her
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={10}
              required
              className="resize-y rounded-2xl border border-[var(--line)] bg-white px-3 py-3 text-base leading-6 font-normal outline-none focus:border-[#8a5a12]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                onClick={() => {
                  setText(sample.text);
                  void check(sample.text);
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
            {loading ? "Reading the messages…" : "Check the road"}
          </button>
        </form>
      </div>
    </div>
  );
}
