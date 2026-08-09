import { describe, expect, it } from "vitest";
import { getHomeJourneyState } from "./home-state";

describe("getHomeJourneyState", () => {
  it("turns imported résumé details into one profile review", () => {
    const state = getHomeJourneyState({ approvedEvidence: 0, pendingEvidence: 33 });

    expect(state.primaryAction).toEqual({
      href: "/career-truth#profile-review",
      label: "Review my Career Profile",
    });
    expect(state.readiness.label).toBe("Career Profile ready");
    expect(state.readiness.title).toBe("Review the career story Sartho understood.");
    expect(state.profileMetaFallback).toBe("Profile ready to review");
  });

  it("moves an approved workspace on to role analysis", () => {
    const state = getHomeJourneyState({ approvedEvidence: 12, pendingEvidence: 0 });

    expect(state.primaryAction).toEqual({ href: "/jobs", label: "Open opportunities" });
    expect(state.readiness.title).toBe("Your Career Profile is ready.");
  });

  it("does not expose internal record counts during profile review", () => {
    const state = getHomeJourneyState({ approvedEvidence: 4, pendingEvidence: 1 });

    expect(state.primaryAction.label).toBe("Review my Career Profile");
    expect(state.readiness.description).toContain("one concise profile summary");
  });

  it("does not claim that rejected evidence is ready", () => {
    const state = getHomeJourneyState({ approvedEvidence: 0, pendingEvidence: 0 });

    expect(state.readiness.title).toBe("Sartho does not know enough about your career yet.");
    expect(state.primaryAction.href).toBe("/journey");
  });
});
