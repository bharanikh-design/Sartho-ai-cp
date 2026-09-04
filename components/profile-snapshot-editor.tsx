"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRecord, TargetLaneRecord } from "@/lib/types";

/*
 * The professional snapshot, edited where it is shown.
 *
 * This record used to be read-only here, with an "Edit snapshot" link that sent
 * people to Career Direction to change it — the view and its editor lived on
 * different pages. Now the same fields are editable in place. Saving reuses the
 * career-direction endpoint, carrying the existing priorities and strengths
 * through untouched so a snapshot edit never disturbs the search strategy.
 */
export function ProfileSnapshotEditor({
  profile,
  lanes,
  roleCount,
  displayStrengths,
}: {
  profile: ProfileRecord | null;
  lanes: TargetLaneRecord[];
  roleCount: number;
  displayStrengths: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [summary, setSummary] = useState(profile?.summary ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [workAuthorisation, setWorkAuthorisation] = useState(profile?.work_authorisation ?? "");

  const positioning = headline.trim() || summary.trim() || "Your confirmed career story";

  async function save() {
    setStatus("saving");
    const response = await fetch("/api/career/direction", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        headline,
        summary,
        location,
        workAuthorisation,
        // Carried through unchanged: a snapshot edit must not reset either.
        strengths: profile?.strengths ?? [],
        lanes: lanes.map((lane) => ({ id: lane.id, name: lane.name, weight: lane.weight, active: lane.active })),
      }),
    });
    if (response.ok) {
      setStatus("idle");
      setEditing(false);
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.refresh();
    } else {
      setStatus("error");
    }
  }

  function cancel() {
    setHeadline(profile?.headline ?? "");
    setSummary(profile?.summary ?? "");
    setLocation(profile?.location ?? "");
    setWorkAuthorisation(profile?.work_authorisation ?? "");
    setStatus("idle");
    setEditing(false);
  }

  if (editing) {
    return (
      <section className="glass-card profile-record" aria-labelledby="profile-record-title">
        <div className="profile-record__heading">
          <div><p className="product-system-eyebrow">Professional snapshot</p><h2 id="profile-record-title">Edit your snapshot</h2></div>
        </div>
        <div className="direction-fields">
          <label className="field-wide"><span>Positioning headline</span><input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="e.g. Regional Transformation Director" /></label>
          <label className="field-wide"><span>Summary</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} placeholder="A sentence or two on where you are and where you are heading" /></label>
          <label><span>Current location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore" /></label>
          <label><span>Work rights and mobility</span><input value={workAuthorisation} onChange={(event) => setWorkAuthorisation(event.target.value)} placeholder="Countries, visa status, relocation or remote preference" /></label>
        </div>
        <div className="profile-record__actions">
          {status === "error" ? <span className="inline-error" role="alert">Could not save—please try again.</span> : null}
          <button type="button" className="ghost-button" onClick={cancel} disabled={status === "saving"}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save snapshot"}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card profile-record" aria-labelledby="profile-record-title">
      <div className="profile-record__heading">
        <div><p className="product-system-eyebrow">Professional snapshot</p><h2 id="profile-record-title">{positioning}</h2></div>
        <button type="button" className="ghost-button" onClick={() => setEditing(true)}>Edit snapshot</button>
      </div>
      {headline.trim() && summary.trim() && headline.trim() !== summary.trim() ? <p className="profile-record__summary">{summary}</p> : null}
      <div className="profile-record__facts">
        <div><span>Location</span><strong>{location || "Not recorded"}</strong></div>
        <div><span>Work rights and mobility</span><strong>{workAuthorisation || "Not recorded"}</strong></div>
        <div><span>Career history</span><strong>{roleCount} role{roleCount === 1 ? "" : "s"}</strong></div>
      </div>
      <div className="profile-record__strengths">
        <span>Leading strengths</span>
        <div>{displayStrengths.length ? displayStrengths.map((strength) => <strong key={strength}>{strength}</strong>) : <em>No strengths recorded yet</em>}</div>
      </div>
      <p className="profile-record__note">Set your role priorities and mobility in <Link href="/career-direction#priorities">Career Direction</Link>.</p>
    </section>
  );
}
