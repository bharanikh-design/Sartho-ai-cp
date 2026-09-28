import { describe, expect, it } from "vitest";
import { isCrossSiteRequest, isMutatingMethod, publicHost } from "./same-origin";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("isMutatingMethod", () => {
  it("names the methods that change state", () => {
    expect(isMutatingMethod("POST")).toBe(true);
    expect(isMutatingMethod("delete")).toBe(true);
    expect(isMutatingMethod("GET")).toBe(false);
    expect(isMutatingMethod("HEAD")).toBe(false);
    expect(isMutatingMethod("OPTIONS")).toBe(false);
  });
});

describe("isCrossSiteRequest", () => {
  it("believes the browser's own verdict first", () => {
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "cross-site", origin: "https://sartho.tech" }), "sartho.tech")).toBe(true);
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "same-origin" }), "sartho.tech")).toBe(false);
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "none" }), "sartho.tech")).toBe(false);
  });

  it("falls back to comparing the Origin header with the host", () => {
    expect(isCrossSiteRequest(headers({ origin: "https://sartho.tech" }), "sartho.tech")).toBe(false);
    expect(isCrossSiteRequest(headers({ origin: "https://SARTHO.tech" }), "sartho.tech")).toBe(false);
    expect(isCrossSiteRequest(headers({ origin: "https://evil.example" }), "sartho.tech")).toBe(true);
    expect(isCrossSiteRequest(headers({ origin: "https://sartho.tech.evil.example" }), "sartho.tech")).toBe(true);
    expect(isCrossSiteRequest(headers({ origin: "null" }), "sartho.tech")).toBe(true);
    expect(isCrossSiteRequest(headers({ origin: "not a url" }), "sartho.tech")).toBe(true);
  });

  /* A server, a scheduled job or a test runner sends neither header. */
  it("lets a request with no browser provenance through to the route's own auth", () => {
    expect(isCrossSiteRequest(headers({}), "sartho.tech")).toBe(false);
  });
});

describe("publicHost", () => {
  it("prefers the forwarded host, then Host, then the fallback", () => {
    expect(publicHost(headers({ "x-forwarded-host": "www.sartho.tech, internal", host: "internal" }), "fallback")).toBe("www.sartho.tech");
    expect(publicHost(headers({ host: "localhost:3000" }), "fallback")).toBe("localhost:3000");
    expect(publicHost(headers({}), "fallback")).toBe("fallback");
  });
});
