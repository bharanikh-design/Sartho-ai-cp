import type { SkillProfile, SkillStrength } from "@/lib/matching/skill-profile";

/*
 * The skill set, shown with its receipts.
 *
 * Every row says how many approved claims support it and at how many
 * employers, because that is the difference between a skill someone has and a
 * word someone wrote. The strongest claim behind each one is on show for the
 * same reason: a profile you cannot interrogate is a profile you cannot trust
 * in front of an interviewer.
 */

const strengthLabel: Record<SkillStrength, string> = {
  core: "Core",
  strong: "Strong",
  supporting: "Supporting",
  emerging: "Emerging",
};

export function SkillSet({ profile }: { profile: SkillProfile }) {
  if (!profile.skills.length) {
    return (
      <div className="empty-inline-state">
        {profile.totalApproved
          ? "Your approved evidence does not carry any skill tags yet, so there is nothing to group."
          : "Approve some evidence and your skill set builds itself from it."}
      </div>
    );
  }

  return (
    <>
      <ul className="skill-list">
        {profile.skills.map((skill) => (
          <li key={skill.name} className={`skill-row is-${skill.strength}`}>
            <div className="skill-head">
              <strong className="skill-name">{skill.name}</strong>
              <span className={`skill-badge is-${skill.strength}`}>{strengthLabel[skill.strength]}</span>
            </div>

            <div className="skill-facts">
              <span>
                {skill.evidenceCount} claim{skill.evidenceCount === 1 ? "" : "s"}
              </span>
              {skill.employerCount > 1 ? <span>{skill.employerCount} employers</span> : null}
              {skill.years ? <span>{skill.years} year{skill.years === 1 ? "" : "s"}</span> : null}
              {skill.current ? <span className="skill-current">Current</span> : null}
            </div>

            {skill.topClaim ? <p className="skill-claim">“{skill.topClaim}”</p> : null}
          </li>
        ))}
      </ul>

      {profile.unclassified ? (
        <p className="skill-footnote">
          {profile.unclassified} approved claim{profile.unclassified === 1 ? "" : "s"} carr
          {profile.unclassified === 1 ? "ies" : "y"} no skill tag, so {profile.unclassified === 1 ? "it is" : "they are"} not
          grouped here. {profile.unclassified === 1 ? "It is" : "They are"} still used when matching a role.
        </p>
      ) : null}
    </>
  );
}
