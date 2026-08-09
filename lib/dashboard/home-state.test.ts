import { describe, expect, it } from "vitest";
import { getHomeJourneyState } from "./home-state";

describe("getHomeJourneyState", () => {
  it("recognises imported evidence even when no profile headline exists", () => {
    const state = getHomeJourneyState({ approvedEvidence: 0, pendingEvidence: 33 });

    expect(state.primaryAction).toEqual({
      href: "/journey#confirm",
      label: "Review 3 evidence records",
    });
    expect(state.readiness.label).toBe("Career evidence loaded");
    expect(state.readiness.title).toBe("33 claims are ready for your review.");
    expect(state.profileMetaFallback).toBe("Evidence imported");
  });

  it("moves an approved workspace on to role analysis", () => {
    const state = getHomeJourneyState({ approvedEvidence: 12, pendingEvidence: 0 });

    expect(state.primaryAction).toEqual({ href: "/jobs", label: "Open opportunities" });
    expect(state.readiness.title).toBe("Your evidence base is ready.");
  });

  it("keeps mixed evidence focused on the remaining review", () => {
    const state = getHomeJourneyState({ approvedEvidence: 4, pendingEvidence: 1 });

    expect(state.primaryAction.label).toBe("Review 1 evidence record");
    expect(state.readiness.description).toContain("4 already approved");
  });

  it("does not claim that rejected evidence is ready", () => {
    const state = getHomeJourneyState({ approvedEvidence: 0, pendingEvidence: 0 });

    expect(state.readiness.title).toBe("Nothing is approved for use yet.");
    expect(state.primaryAction.href).toBe("/journey");
  });
});
