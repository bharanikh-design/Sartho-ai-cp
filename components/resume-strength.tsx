import type { ResumeStrength } from "@/lib/resume/strength";

/*
 * What would make this résumé stronger, said plainly.
 *
 * Every line here is a fact about the record rather than an opinion about the
 * person, which is why each finding names how many claims it concerns. Advice
 * you can count is advice you can act on and then watch disappear.
 */

const severityLabel = { high: "Fix first", medium: "Worth fixing", low: "Polish" } as const;

export function ResumeStrengthPanel({ strength }: { strength: ResumeStrength }) {
  if (!strength.approved) {
    return (
      <div className="empty-inline-state">
        Approve some evidence and Sartho will tell you what would make it stronger.
      </div>
    );
  }

  const band = strength.score >= 80 ? "is-good" : strength.score >= 55 ? "is-fair" : "is-weak";

  return (
    <div className="strength">
      <div className={`strength-score ${band}`}>
        <strong>{strength.score}</strong>
        <span>out of 100</span>
      </div>

      <div className="strength-body">
        <p className="strength-lead">
          {strength.quantified} of your {strength.approved} approved claim
          {strength.approved === 1 ? "" : "s"} say how much changed
          {strength.quantified === strength.approved ? " — all of them." : "."}
        </p>

        {strength.findings.length ? (
          <ul className="strength-findings">
            {strength.findings.map((finding) => (
              <li key={finding.id} className={`strength-finding is-${finding.severity}`}>
                <div className="strength-finding-head">
                  <strong>{finding.title}</strong>
                  <span className={`strength-tag is-${finding.severity}`}>{severityLabel[finding.severity]}</span>
                </div>
                <p>{finding.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="strength-clear">
            Nothing to fix. Every approved claim carries a number, names what you did rather than what you were near,
            and is attached to a dated role.
          </p>
        )}
      </div>
    </div>
  );
}
