import { describe, expect, it } from "vitest";
import { atsVerdict, bulletsIn, scoreAts } from "./ats";
import type { RuleAnalysis } from "@/lib/types";

const analysis = (missing: string[], matched: string[]): RuleAnalysis => ({
  recommendation: "review",
  confidence: "medium",
  matchedSignals: matched,
  cautionSignals: [],
  missingRequirements: missing,
  explanation: "",
});

const draft = (body: string) => body.padEnd(2400, " requirement delivery experience");

describe("scoreAts", () => {
  /*
   * The distinction the whole file turns on. A strength the evidence supports
   * but the draft omits is a fix. A requirement the evidence cannot back is
   * not a keyword to add — suggesting it would be telling someone to lie.
   */
  it("separates strengths it can back from requirements it cannot", () => {
    const result = scoreAts(
      draft("Led business analysis across two releases."),
      analysis(["Cybersecurity"], ["Business analysis", "Agile delivery"]),
    );
    expect(result.unusedStrengths).toEqual(["Agile delivery"]);
    expect(result.unbackedRequirements).toEqual(["Cybersecurity"]);
    expect(result.unusedStrengths).not.toContain("Cybersecurity");
  });

  it("does not punish a draft for omitting what it cannot evidence", () => {
    const honest = analysis(["Cybersecurity", "Cloud & infrastructure"], ["Business analysis"]);
    const none = analysis([], ["Business analysis"]);
    const body = draft("Business analysis across two releases, cutting 30% of rework in 4 teams.");
    expect(scoreAts(body, honest).score).toBe(scoreAts(body, none).score);
  });

  it("counts quantified achievement, not any digit", () => {
    const result = scoreAts(draft("Cut cost by 42% and saved $1.2M across 11 countries."), analysis([], []));
    expect(result.metricsFound).toBeGreaterThanOrEqual(3);
  });

  it("names the bullets carrying no figure", () => {
    const result = scoreAts([
      "HEADLINE",
      "",
      "EXPERIENCE",
      "• Cut rework by 30% across two releases.",
      "• Analysed a live retail dataset to diagnose inefficiencies.",
      "• Designed decision logic for an automated tool.",
    ].join("\n"), analysis([], []));

    expect(result.weakBullets.map((bullet) => bullet.index)).toEqual([1, 2]);
    expect(result.weakBullets[0].text).toMatch(/live retail dataset/);
    expect(result.checks[1].detail).toMatch(/1 of 3 bullets carry a figure/);
  });

  /*
   * A /g regex keeps lastIndex between calls, so testing bullets with one
   * shared instance silently skips every other line.
   */
  it("judges each bullet independently", () => {
    const result = scoreAts([
      "• Delivered 4 releases.",
      "• Delivered 5 releases.",
      "• Delivered several releases.",
    ].join("\n"), analysis([], []));
    expect(result.weakBullets.map((bullet) => bullet.index)).toEqual([2]);
  });

  it("scores a draft that uses its evidence above one that does not", () => {
    const both = analysis([], ["Business analysis", "Agile delivery"]);
    const covered = scoreAts(draft("Business analysis and agile delivery every sprint, cutting 30% of rework."), both);
    const bare = scoreAts(draft("Did some work on things."), both);
    expect(covered.score).toBeGreaterThan(bare.score);
  });

  it("says plainly when there is no analysis to check against", () => {
    const result = scoreAts(draft("A draft with no role behind it."), null);
    expect(result.checks[0].detail).toMatch(/Run the role analysis/);
  });

  it("flags an empty draft rather than scoring it", () => {
    const result = scoreAts("", analysis([], []));
    expect(result.wordCount).toBe(0);
    expect(result.checks[2].state).toBe("fail");
  });
});

describe("bulletsIn", () => {
  it("reads the bullet lines and nothing else", () => {
    expect(bulletsIn([
      "Business Analyst | Strategy",
      "",
      "PROFESSIONAL SUMMARY",
      "Analytical and solutions-focused.",
      "",
      "EXPERIENCE",
      "• Delivered an implementation roadmap.",
      "•   Designed a phased rollout strategy.",
    ].join("\n"))).toEqual([
      "Delivered an implementation roadmap.",
      "Designed a phased rollout strategy.",
    ]);
  });

  it("returns nothing for a draft with no bullets", () => {
    expect(bulletsIn("Just prose, no list.")).toEqual([]);
  });
});


/*
 * A green tick sat directly above "5 bullets carry no number at all", because
 * the check passed on four figures anywhere in the draft. Both cannot be true.
 */
describe("quantified achievement, judged per bullet", () => {
  const noAnalysis = null;
  const draftOf = (bullets: string[]) => ["HEADLINE", "", "EXPERIENCE", ...bullets.map((b) => `• ${b}`)].join("\n");

  it("fails a draft whose figures are clustered in a couple of lines", () => {
    const result = scoreAts(draftOf([
      "Cut rework by 30% and cost by 12% across 4 releases in 2 regions.",
      "Analysed a live retail dataset to diagnose inefficiencies.",
      "Designed decision logic for an automated tool.",
      "Presented a structured recommendation to a judging panel.",
      "Collaborated with an industry mentor to refine the solution.",
    ]), noAnalysis);

    /* Exactly four figures in the document — the old rule's pass threshold. */
    expect(result.metricsFound).toBe(4);
    expect(result.checks[1].state).toBe("fail");
    expect(result.checks[1].detail).toMatch(/1 of 5 bullets carry a figure/);
  });

  it("passes when most lines carry one", () => {
    const result = scoreAts(draftOf([
      "Cut rework by 30%.",
      "Analysed 40,000 rows of retail data.",
      "Led a team of 3.",
      "Presented to a panel.",
    ]), noAnalysis);
    expect(result.checks[1].state).toBe("pass");
    expect(result.checks[1].detail).toMatch(/3 of 4 bullets carry a figure/);
  });

  it("says so plainly when there are no bullets to judge", () => {
    const result = scoreAts("Just prose.", noAnalysis);
    expect(result.bulletCount).toBe(0);
    expect(result.checks[1].state).toBe("fail");
    expect(result.checks[1].detail).toMatch(/No bullet points found/);
  });
});

/*
 * "100% of the strengths this role wants" reads like a complete answer, and off
 * two matched capabilities it is barely an opinion — while carrying 60% of the
 * score. Same reasoning as the matcher's requirement coverage.
 */
describe("strength coverage, scaled by how much there was to use", () => {
  const body = (text: string) => text.padEnd(2400, " delivery experience requirement");

  it("discounts a perfect score drawn from one or two strengths", () => {
    const thin = scoreAts(body("Business analysis every day."), analysis([], ["Business analysis"]));
    expect(thin.checks[0].detail).toMatch(/1 of the 1 strength/);
    expect(thin.checks[0].state).not.toBe("pass");
    /*
     * And the sentence has to carry the caveat too, not just the score. It
     * read "2 of the 2 strengths ... appear in the draft" under a warning
     * icon — both halves true, but the sentence said only the flattering one,
     * so the icon looked like a bug. A warning over text that reads as success
     * teaches people to ignore warnings.
     */
    expect(thin.checks[0].detail).toMatch(/not yet a confident read/);

    const full = scoreAts(
      body("Business analysis, agile delivery, data analysis and stakeholder management."),
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    expect(full.checks[0].detail).toMatch(/4 of the 4 strengths/);
    expect(full.checks[0].state).toBe("pass");
    /* With enough to judge by, no caveat — a pass should read like one. */
    expect(full.checks[0].detail).not.toMatch(/confident read/);
  });
});

/*
 * Sartho's own drafts use "•", but the workbench takes a résumé somebody
 * already has, and those arrive with hyphens and asterisks. Recognising only
 * the marker Sartho emits meant a pasted CV looked like prose with no bullets
 * to improve at all.
 */
describe("bullet markers as people actually write them", () => {
  it("reads hyphen and asterisk bullets, not only Sartho's own", () => {
    expect(bulletsIn([
      "EXPERIENCE",
      "- Delivered an implementation roadmap.",
      "* Designed a phased rollout strategy.",
      "• Presented to a judging panel.",
      "  – Ran the workshop series.",
    ].join("\n"))).toEqual([
      "Delivered an implementation roadmap.",
      "Designed a phased rollout strategy.",
      "Presented to a judging panel.",
      "Ran the workshop series.",
    ]);
  });

  it("does not mistake a sentence containing a dash for a bullet", () => {
    expect(bulletsIn("Analysed data — and reported on it.")).toEqual([]);
  });
});

/*
 * A number on its own is a grade, and a grade is not advice. What somebody
 * editing a résumé wants to know is which of the three things wrong with it is
 * worth fixing first — and that is arithmetic, not opinion: the score is a
 * weighted sum, so the biggest lever is the check with the largest remaining
 * gain once its weight is applied.
 */
describe("atsVerdict", () => {
  const body = (text: string) => text.padEnd(2400, " delivery experience requirement");

  it("names the score in words a person reads at a glance", () => {
    const strong = scoreAts(
      body("• Business analysis across 4 teams.\n• Agile delivery of 12 releases.\n• Data analysis on 3 datasets.\n• Stakeholder management for 9 partners."),
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    expect(["Strong", "Ready to send"]).toContain(atsVerdict(strong).headline);
    expect(atsVerdict(scoreAts("", null)).headline).toBe("Needs work");
  });

  /*
   * Vocabulary carries 0.6 of the score and length carries 0.15, so a draft
   * missing strengths hears about those first however loud the length warning
   * looks. Getting this backwards is how a tool sends somebody off to pad word
   * count while the thing that actually gates them goes unmentioned.
   */
  it("points at vocabulary before length, because that is where the points are", () => {
    const missingStrengths = scoreAts(
      body("• Ran a project with 6 people."),
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    expect(atsVerdict(missingStrengths).lever).toMatch(/strengths your evidence already backs/);
  });

  it("counts the lines that need a figure when vocabulary is already covered", () => {
    const unquantified = scoreAts(
      body("• Business analysis every day.\n• Agile delivery throughout.\n• Data analysis regularly.\n• Stakeholder management always."),
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    expect(atsVerdict(unquantified).lever).toMatch(/Put a figure in 4 lines/);
  });

  it("says how many words short, rather than that the length is wrong", () => {
    const short = scoreAts(
      "• Business analysis across 4 teams.\n• Agile delivery of 12 releases.\n• Data analysis on 3 sets.\n• Stakeholder management for 9.",
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    expect(short.wordCount).toBeLessThan(350);
    expect(atsVerdict(short).lever).toMatch(/Add about \d+ more words/);
  });

  it("offers no lever when there is under a point left in it", () => {
    const perfect = scoreAts(
      body("• Business analysis across 4 teams.\n• Agile delivery of 12 releases.\n• Data analysis on 3 datasets.\n• Stakeholder management for 9 partners."),
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    if (perfect.score === 100) expect(atsVerdict(perfect).lever).toBeNull();
  });

  it("asks for the analysis rather than blaming the draft when there is nothing to check against", () => {
    const noAnalysis = scoreAts(body("• Did a thing with 3 people."), null);
    const lever = atsVerdict(noAnalysis).lever ?? "";

    /*
     * Matched on intent rather than on the sentence, so rewording the copy is
     * not a test failure — what must not change is that the one thing offered
     * is the missing analysis, not a rewrite of a draft nobody has judged yet.
     */
    expect(lever).toMatch(/analys/i);
    expect(lever).not.toMatch(/figure|more words|verb|passive/i);
  });
});

/*
 * Padding to clear the length floor, so these read the check under test rather
 * than the word count. Same shape as the helper the blocks above use, declared
 * here because that one is scoped to its own describe.
 */
const padded = (text: string) => text.padEnd(2400, " delivery experience requirement");

/*
 * The workbench always scores with no analysis, so the evidence check could
 * never pass there — and it was still worth 60% of the number. A flawless
 * résumé topped out at 40, the panel hid the check while the score kept
 * counting its zero, and a real senior CV came out at 8 out of 100.
 */
describe("a check nobody can answer is not a check failed", () => {
  const strong = [
    "• Cut incident volume 42% across 11 markets.",
    "• Led a $1.2M ITSM programme for 3 business units.",
    "• Shipped 24 releases with a team of 9.",
    "• Delivered 6 migrations at 99.9% availability.",
  ].join("\n");

  it("does not cap a draft that has no role to be scored against", () => {
    const scored = scoreAts(padded(strong), null);

    expect(scored.score).toBeGreaterThan(40);
    expect(scored.checks.find((check) => check.label === "Evidence you can back, used")?.applicable).toBe(false);
  });

  it("scores the same draft the same way whether or not the evidence check applies", () => {
    /* Every applicable check passes either way, so the mean is unchanged. */
    const withoutRole = scoreAts(padded(strong), null);
    expect(withoutRole.score).toBe(
      Math.round(
        withoutRole.checks
          .filter((check) => check.applicable)
          .reduce((sum, check) => sum + check.weight * (check.state === "pass" ? 100 : check.state === "warn" ? 55 : 0), 0)
        / withoutRole.checks.filter((check) => check.applicable).reduce((sum, check) => sum + check.weight, 0),
      ),
    );
  });

  it("still reports an empty draft as nothing", () => {
    expect(scoreAts("", null).score).toBe(0);
  });
});

describe("verb and voice checks", () => {
  const duties = [
    "• Responsible for the service desk across 4 sites.",
    "• Helped with the 12 releases that shipped.",
    "• Worked on 3 migrations.",
    "• Assisted the team of 9.",
  ].join("\n");

  it("marks lines that open on a duty rather than a result", () => {
    const scored = scoreAts(padded(duties), null);
    const check = scored.checks.find((item) => item.label === "Strong opening verbs");

    expect(check?.state).toBe("fail");
    expect(check?.detail).toContain("4 of 4");
  });

  it("passes a draft that opens on what the person did", () => {
    const done = "• Cut cost 20%.\n• Led 4 teams.\n• Shipped 12 releases.\n• Delivered 3 migrations.";
    expect(scoreAts(padded(done), null).checks.find((item) => item.label === "Strong opening verbs")?.state).toBe("pass");
  });

  it("finds the passive voice and says who is missing", () => {
    const passive = "• The rollout was delivered to 9 sites.\n• Costs were reduced by 20%.\n• The team was managed across 3 offices.\n• Uptime was improved to 99%.";
    const check = scoreAts(padded(passive), null).checks.find((item) => item.label === "Active voice");

    expect(check?.state).toBe("fail");
    expect(check?.detail).toMatch(/passive voice/);
  });
});

/*
 * "Led the ITSM rollout in 2019" is not a quantified achievement, and counting
 * it marked a career history full of dates as measurable.
 */
describe("calendar years are dates, not achievements", () => {
  it("does not count a year as a figure", () => {
    const dated = scoreAts(padded("• Led the ITSM rollout in 2019.\n• Ran the 2020 migration programme."), null);
    expect(dated.weakBullets).toHaveLength(2);
  });

  it("still counts a real quantity in a line that also carries a year", () => {
    const mixed = scoreAts(padded("• Cut incident volume 42% during the 2019 rollout."), null);
    expect(mixed.weakBullets).toHaveLength(0);
  });

  /*
   * The separator and the symbol are what keep a real quantity out of the
   * year heuristic's way, and both are how people actually write these.
   */
  it("does not mistake money or a large quantity for a year", () => {
    const money = scoreAts(padded("• Saved $2,000 on licensing.\n• Closed 2,400 tickets."), null);
    expect(money.weakBullets).toHaveLength(0);
  });

  /*
   * The documented limit, asserted so it is a known trade-off rather than a
   * surprise: a bare four-digit quantity in year range reads as a date.
   */
  it("reads a bare four-digit quantity in year range as a date, as documented", () => {
    const ambiguous = scoreAts(padded("• Held attrition at 2019 basis points."), null);
    expect(ambiguous.weakBullets).toHaveLength(1);
  });
});
