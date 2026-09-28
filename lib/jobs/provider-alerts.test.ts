import { describe, expect, it, vi } from "vitest";
import type { notifyOperatorThrottled } from "@/lib/operations/alerts";
import { alertProviderRetirements, PROVIDER_ALERT_WINDOW_MS } from "./provider-alerts";

describe("alertProviderRetirements", () => {
  it("alerts on the retirements a person has to fix, and says what to do", async () => {
    const notify = vi.fn<typeof notifyOperatorThrottled>(async () => "emailed");
    await alertProviderRetirements([
      { provider: "jsearch", cause: "spent_allowance", message: "Google for Jobs: you have exceeded the MONTHLY quota" },
      { provider: "adzuna", cause: "auth", message: "Adzuna search failed (401)." },
      { provider: "serpapi", cause: "not_configured", message: "Google for Jobs (SerpApi) is not configured." },
    ], { notify });

    expect(notify).toHaveBeenCalledTimes(3);
    const first = notify.mock.calls[0][0];
    expect(first.key).toBe("provider-retired:jsearch:spent_allowance");
    expect(first.windowMs).toBe(PROVIDER_ALERT_WINDOW_MS);
    expect(first.subject).toContain("Google for Jobs");
    expect(first.lines.join(" ")).toContain("MONTHLY quota");
    expect(first.lines.join(" ")).toContain("allowance resets");
    expect(notify.mock.calls[1][0].lines.join(" ")).toContain("Check the key");
    expect(notify.mock.calls[2][0].lines.join(" ")).toContain("Set the provider's key");
  });

  /* A timeout or a run of errors is weather; the next search may not see it. */
  it("stays quiet about weather", async () => {
    const notify = vi.fn<typeof notifyOperatorThrottled>(async () => "emailed");
    await alertProviderRetirements([
      { provider: "jsearch", cause: "timeouts", message: "Google for Jobs timed out after 10000ms" },
      { provider: "adzuna", cause: "errors", message: "Adzuna search failed (503)." },
    ], { notify });
    expect(notify).not.toHaveBeenCalled();
  });

  it("never lets an alert failure reach the search that raised it", async () => {
    const notify = vi.fn<typeof notifyOperatorThrottled>(async () => { throw new Error("mail is down"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      alertProviderRetirements([{ provider: "jsearch", cause: "auth", message: "JSearch returned 401" }], { notify }),
    ).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});
