"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EvidenceRecord } from "@/lib/types";

const confidenceOrder = { high: 0, medium: 1, low: 2 } as const;

function roleLabel(item: EvidenceRecord) {
  if (!item.career_role) return "Career highlight";
  return `${item.career_role.employer} · ${item.career_role.title}`;
}

export function CareerProfileReview({ initialItems }: { initialItems: EvidenceRecord[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usable = items.filter((item) => item.approval_status !== "rejected");
  const pending = usable.filter((item) => item.approval_status === "pending");
  const confirmed = items.length > 0 && pending.length === 0;

  const strengths = (() => {
    const counts = new Map<string, number>();
    for (const item of usable) {
      for (const domain of item.domains) counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([name]) => name);
  })();

  const highlights = usable
    .filter((item) => item.confidence !== "low")
    .slice()
    .sort((a, b) =>
      Number(Boolean(b.metrics.length)) - Number(Boolean(a.metrics.length))
      || confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
      || b.claim.length - a.claim.length)
    .slice(0, 6);

  const attention = pending.filter((item) => item.confidence === "low");

  async function updateItem(item: EvidenceRecord, patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/evidence/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await response.json() as { evidence?: EvidenceRecord; error?: string };
      if (!response.ok || !result.evidence) throw new Error(result.error ?? "Sartho could not save that change.");
      setItems((current) => current.map((record) => record.id === item.id ? { ...record, ...result.evidence } : record));
      setEditingId(null);
      window.dispatchEvent(new Event("sartho:journey-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not save that change.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmProfile() {
    if (busy || !pending.length) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/evidence/confirm-profile", { method: "PUT" });
      const result = await response.json() as { confirmed?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not confirm your profile.");
      setItems((current) => current.map((item) => item.approval_status === "pending"
        ? { ...item, approval_status: "approved", safe_for_resume: true }
        : item));
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/career-direction");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not confirm your profile.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmed) {
    return (
      <details className="glass-card profile-evidence-disclosure">
        <summary>
          <span><strong>Review or correct extracted evidence</strong><small>Open only when something in your confirmed Career Profile needs changing.</small></span>
          <span>{usable.length} approved items <b aria-hidden="true">⌄</b></span>
        </summary>
        <div className="profile-evidence-disclosure__content">
          <div className="profile-highlight-grid">
            {highlights.map((item) => (
              <article key={item.id}>
                <span>{roleLabel(item)}</span>
                {editingId === item.id ? (
                  <>
                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} aria-label="Correct career highlight" />
                    <div className="attention-actions">
                      <button type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
                      <button type="button" className="is-primary" onClick={() => void updateItem(item, { claim: draft })} disabled={busy || draft.trim().length < 10}>Save correction</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{item.claim}</p>
                    {item.metrics.length ? <strong>{item.metrics.join(" · ")}</strong> : null}
                    <button type="button" className="highlight-edit" onClick={() => { setEditingId(item.id); setDraft(item.claim); }}>Correct this</button>
                  </>
                )}
              </article>
            ))}
          </div>
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
        </div>
      </details>
    );
  }

  return (
    <section className="glass-card content-card profile-review" id="profile-review">
      <div className="profile-review-heading">
        <div>
          <div className="page-eyebrow">One review, not dozens</div>
          <h2>Does this career profile represent you?</h2>
          <p>Sartho structured your résumé into a working career profile. Review the summary below; the underlying details remain available to matching without becoming homework for you.</p>
        </div>
        <span className={`profile-review-status ${confirmed ? "is-confirmed" : ""}`}>
          {confirmed ? "Profile confirmed" : "Ready for your review"}
        </span>
      </div>

      <div className="profile-review-grid">
        <section className="profile-review-section">
          <span className="profile-review-label">Career strengths</span>
          <h3>The capabilities your résumé consistently demonstrates</h3>
          <div className="profile-strength-list">
            {strengths.length
              ? strengths.map((strength) => <span key={strength}>{strength}</span>)
              : <p>No clear strengths were extracted yet.</p>}
          </div>
          <Link href="/career-direction#strengths" className="profile-text-action">Edit career strengths <span>→</span></Link>
        </section>

        <section className="profile-review-section profile-review-attention">
          <span className="profile-review-label">Needs your attention</span>
          <h3>{attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"} Sartho is not confident about` : "No ambiguities detected"}</h3>
          <p>{attention.length ? "Correct or exclude only these uncertain details before confirming the profile." : "Your résumé was clear enough to confirm as one profile."}</p>
          {attention.slice(0, 3).map((item) => (
            <article key={item.id} className="attention-item">
              <strong>{roleLabel(item)}</strong>
              {editingId === item.id ? (
                <>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} aria-label="Correct career detail" />
                  <div className="attention-actions">
                    <button type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
                    <button type="button" className="is-primary" onClick={() => void updateItem(item, { claim: draft })} disabled={busy || draft.trim().length < 10}>Save correction</button>
                  </div>
                </>
              ) : (
                <>
                  <p>{item.claim}</p>
                  <div className="attention-actions">
                    <button type="button" onClick={() => { setEditingId(item.id); setDraft(item.claim); }}>Correct</button>
                    <button type="button" onClick={() => void updateItem(item, { approval_status: "rejected" })} disabled={busy}>Exclude</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>
      </div>

      <section className="profile-highlights">
        <div>
          <span className="profile-review-label">Signature career highlights</span>
          <h3>A concise view of what stands out</h3>
        </div>
        <div className="profile-highlight-grid">
          {highlights.map((item) => (
            <article key={item.id}>
              <span>{roleLabel(item)}</span>
              {editingId === item.id ? (
                <>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} aria-label="Correct career highlight" />
                  <div className="attention-actions">
                    <button type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
                    <button type="button" className="is-primary" onClick={() => void updateItem(item, { claim: draft })} disabled={busy || draft.trim().length < 10}>Save correction</button>
                  </div>
                </>
              ) : (
                <>
                  <p>{item.claim}</p>
                  {item.metrics.length ? <strong>{item.metrics.join(" · ")}</strong> : null}
                  <button type="button" className="highlight-edit" onClick={() => { setEditingId(item.id); setDraft(item.claim); }}>Correct this</button>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <div className="profile-confirm-bar">
        <div>
          <strong>{confirmed ? "Your career profile is confirmed" : "If this summary looks right, you are done here."}</strong>
          <span>{confirmed ? "Continue to career direction and choose what Sartho should pursue." : "One confirmation makes the profile available for matching, résumé tailoring and interview preparation."}</span>
        </div>
        {confirmed ? (
          <Link href="/career-direction" className="primary-button">Continue to career direction <span>→</span></Link>
        ) : (
          <button type="button" className="primary-button" onClick={() => void confirmProfile()} disabled={busy || !pending.length}>
            {busy ? "Confirming…" : "Everything looks right — continue"}
          </button>
        )}
      </div>
    </section>
  );
}
