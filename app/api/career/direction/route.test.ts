import { describe, expect, it } from "vitest";
import { directionSchema } from "./route";

const base = {
  headline: "Transformation leader",
  summary: "A meaningful next chapter",
  location: "Singapore",
  workAuthorisation: "Singapore citizen",
  strengths: ["Transformation leadership"],
};

describe("career direction boundary", () => {
  it("allows resumable progress before profile weights reach 100%", () => {
    expect(directionSchema.safeParse({
      ...base,
      lanes: [{ id: "draft-1", name: "Engagement leader", weight: 40, active: true }],
    }).success).toBe(true);
  });

  it("rejects duplicate target profiles regardless of case", () => {
    expect(directionSchema.safeParse({
      ...base,
      lanes: [
        { id: "draft-1", name: "Engagement leader", weight: 50, active: true },
        { id: "draft-2", name: "ENGAGEMENT LEADER", weight: 50, active: true },
      ],
    }).success).toBe(false);
  });
});
