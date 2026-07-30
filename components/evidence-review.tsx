"use client";

import { useMemo, useState } from "react";
import type { ApprovalStatus, EvidenceRecord } from "@/lib/types";

type Filter = "all" | "euc" | "servicenow" | "leadership";

type UndoState = {
  before: EvidenceRecord;
  label: string;
};

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All evidence" },
  { id: "euc", label: "EUC & ITSM" },
  { id: "servicenow", label: "ServiceNow" },
  { id: "leadership", label: "Leadership" },
];

export function EvidenceReview({ initialItems }: { initialItems: EvidenceRecord[] }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftClaim, setDraftClaim] = useState("");
  const [draftContext, setDraftContext] = useState("");
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => {
      const searchable = `${item.claim} ${item.domains.join(" ")} ${item.career_role?.title ?? ""}`.toLowerCase();
      if (filter === "euc") return /\beuc\b|digital workplace|itsm|it service/.test(searchable);
      if (filter === "servicenow") return searchable.includes("servicenow");
      return /lead|leadership|director|programme|program|stakeholder|team/.test(searchable);
    });
  }, [filter, items]);

  async function persist(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/evidence/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = (await response.json()) as { evidence?: EvidenceRecord; error?: string };
    if (!response.ok || !result.evidence) throw new Error(result.error ?? "Unable to save the evidence change.");
    return result.evidence;
  }

  async function changeStatus(item: EvidenceRecord, status: ApprovalStatus) {
    if (busyId) return;
    const before = item;
    const optimistic = { ...item, approval_status: status, safe_for_resume: status === "approved" };
    setBusyId(item.id);
    setError(null);
    setItems((current) => current.map((record) => record.id === item.id ? optimistic : record));

    try {
      const saved = await persist(item.id, { approval_status: status });
      setItems((current) => current.map((record) => record.id === item.id ? { ...optimistic, ...saved } : record));
      setUndo({ before, label: status === "approved" ? "Evidence approved" : status === "rejected" ? "Evidence rejected" : "Evidence returned to review" });
    } catch (caught) {
      setItems((current) => current.map((record) => record.id === item.id ? before : record));
      setError(caught instanceof Error ? caught.message : "Unable to save the evidence change.");
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(item: EvidenceRecord) {
    setEditingId(item.id);
    setDraftClaim(item.claim);
    setDraftContext(item.context ?? "");
    setError(null);
  }

  async function saveEdit(item: EvidenceRecord) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const saved = await persist(item.id, { claim: draftClaim, context: draftContext });
      setItems((current) => current.map((record) => record.id === item.id ? { ...record, ...saved } : record));
      setEditingId(null);
      setUndo({ before: item, label: "Evidence wording updated" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the evidence.");
    } finally {
      setBusyId(null);
    }
  }

  async function undoLastChange() {
    if (!undo || busyId) return;
    const before = undo.before;
    setBusyId(before.id);
    setError(null);
    try {
      const saved = await persist(before.id, {
        approval_status: before.approval_status,
        claim: before.claim,
        context: before.context,
        safe_for_resume: before.safe_for_resume,
      });
      setItems((current) => current.map((record) => record.id === before.id ? { ...before, ...saved } : record));
      setUndo(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to undo the change.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="evidence-toolbar" aria-label="Evidence filters">
        <div className="toolbar-group">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`toolbar-pill${filter === item.id ? " is-active" : ""}`}
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="meta-pill">{visibleItems.length} of {items.length} shown</span>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      {visibleItems.length ? (
        <div className="evidence-list">
          {visibleItems.map((item) => {
            const editing = editingId === item.id;
            const busy = busyId === item.id;
            const roleLabel = item.career_role
              ? `${item.career_role.employer} · ${item.career_role.title}`
              : "Career evidence";

            return (
              <article
                key={item.id}
                className={`evidence-card evidence-card-${item.approval_status}`}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (editing || busy || event.target !== event.currentTarget) return;
                  if (event.key.toLowerCase() === "a") void changeStatus(item, "approved");
                  if (event.key.toLowerCase() === "r") void changeStatus(item, "rejected");
                }}
                aria-label={`${roleLabel}. ${item.approval_status}. Press A to approve or R to reject.`}
              >
                <div className="evidence-meta">
                  <div>
                    <div className="evidence-employer">{roleLabel}</div>
                    {item.period_label ? <div className="evidence-period">{item.period_label}</div> : null}
                  </div>
                  <span className={`status-chip status-${item.approval_status}`}>
                    {item.approval_status === "approved" ? "Approved" : item.approval_status === "rejected" ? "Rejected" : "Needs review"}
                  </span>
                </div>

                {editing ? (
                  <div className="evidence-editor">
                    <label>
                      <span>Evidence claim</span>
                      <textarea value={draftClaim} onChange={(event) => setDraftClaim(event.target.value)} rows={4} />
                    </label>
                    <label>
                      <span>Supporting context</span>
                      <textarea value={draftContext} onChange={(event) => setDraftContext(event.target.value)} rows={3} placeholder="Optional context or clarification" />
                    </label>
                  </div>
                ) : (
                  <>
                    <p className="evidence-claim">{item.claim}</p>
                    {item.context ? <p className="evidence-context">{item.context}</p> : null}
                  </>
                )}

                {item.metrics.length ? <div className="evidence-metrics">{item.metrics.join(" · ")}</div> : null}
                <div className="chip-row">
                  {item.domains.map((domain) => <span key={domain} className="domain-chip">{domain}</span>)}
                </div>

                <footer className="evidence-footer">
                  <span className="evidence-source">
                    Source: {item.source_name ?? "Not recorded"}{item.source_locator ? ` · ${item.source_locator}` : ""}
                  </span>
                  <div className="review-actions">
                    {editing ? (
                      <>
                        <button type="button" className="review-button" disabled={busy} onClick={() => setEditingId(null)}>Cancel</button>
                        <button type="button" className="review-button is-primary" disabled={busy || draftClaim.trim().length < 10} onClick={() => void saveEdit(item)}>{busy ? "Saving…" : "Save"}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="review-button" disabled={busy || item.approval_status === "approved"} onClick={() => void changeStatus(item, "approved")}>Approve</button>
                        <button type="button" className="review-button" disabled={busy} onClick={() => beginEdit(item)}>Edit</button>
                        <button type="button" className="review-button danger" disabled={busy || item.approval_status === "rejected"} onClick={() => void changeStatus(item, "rejected")}>Reject</button>
                      </>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-ledger-inner evidence-empty">
          <h3>No evidence in this view</h3>
          <p>Choose another filter or add evidence to your Career Profile.</p>
        </div>
      )}

      {undo ? (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={() => void undoLastChange()} disabled={Boolean(busyId)}>Undo</button>
          <button type="button" className="toast-close" onClick={() => setUndo(null)} aria-label="Dismiss notification">×</button>
        </div>
      ) : null}
    </>
  );
}
