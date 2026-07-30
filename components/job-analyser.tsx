"use client";

import { useMemo, useState } from "react";
import { analyseJobDescription, type JobAnalysis } from "@/lib/matching/analyse-job";

const recommendationStyles: Record<JobAnalysis["recommendation"], string> = {
  apply: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  skip: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

export function JobAnalyser() {
  const [description, setDescription] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const analysis = useMemo(
    () => (submittedText ? analyseJobDescription(submittedText) : null),
    [submittedText],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="panel p-6">
        <label className="text-sm font-medium" htmlFor="job-description">
          Complete job description
        </label>
        <textarea
          id="job-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-3 min-h-[420px] w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 outline-none placeholder:text-white/30 focus:border-white/30"
          placeholder="Paste the full job description here…"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSubmittedText(description)}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!description.trim()}
          >
            Analyse role
          </button>
          <button
            type="button"
            onClick={() => {
              setDescription("");
              setSubmittedText("");
            }}
            className="rounded-full border border-white/15 px-5 py-3 text-sm"
          >
            Clear
          </button>
        </div>
        <p className="muted mt-4 text-xs">
          This first build uses transparent rule-based screening. Evidence-led AI matching comes after Career Truth approval.
        </p>
      </section>

      <section className="panel p-6" aria-live="polite">
        <div className="muted text-xs uppercase tracking-[0.2em]">Preliminary decision</div>
        {!analysis ? (
          <div className="muted mt-5 rounded-2xl border border-dashed border-white/15 p-6 text-sm leading-6">
            Paste a job description to assess career-lane fit and technical heaviness.
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-wide ${recommendationStyles[analysis.recommendation]}`}
              >
                {analysis.recommendation}
              </span>
              <span className="muted text-sm">Confidence: {analysis.confidence}</span>
            </div>

            <Result label="Best-fit lane" value={analysis.primaryLane} />
            <Result label="Technical heaviness" value={`${analysis.technicalHeaviness}/100`} />

            <SignalList title="Relevant signals" values={analysis.matchedSignals} empty="No strong lane signals detected." />
            <SignalList title="Caution signals" values={analysis.cautionSignals} empty="No material technical or support-heavy warning detected." />

            <p className="muted border-t border-white/10 pt-5 text-sm leading-6">{analysis.explanation}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="muted text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-base font-medium">{value}</div>
    </div>
  );
}

function SignalList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div>
      <div className="text-sm font-medium">{title}</div>
      {values.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={value} className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted mt-2 text-sm">{empty}</p>
      )}
    </div>
  );
}
