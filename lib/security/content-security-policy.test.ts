import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "./content-security-policy";

const directive = (policy: string, name: string) =>
  policy.split("; ").find((entry) => entry.startsWith(`${name} `) || entry === name) ?? null;

describe("createNonce", () => {
  it("is base64, unguessable, and different every time", () => {
    const first = createNonce();
    const second = createNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(first).not.toBe(second);
  });
});

describe("buildContentSecurityPolicy", () => {
  const production = buildContentSecurityPolicy({
    nonce: "abc123==",
    supabaseUrl: "https://project.supabase.co",
    isDevelopment: false,
    isSecure: true,
  });

  it("allows scripts only by nonce, with strict-dynamic and WebAssembly for the PDF preview", () => {
    expect(directive(production, "script-src")).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain("'unsafe-inline' 'nonce");
  });

  it("opens connections to Supabase and its websocket, and nowhere else", () => {
    expect(directive(production, "connect-src")).toBe("connect-src 'self' https://project.supabase.co wss://project.supabase.co");
  });

  it("keeps the floor: no foreign plugins, no base hijack, same-site forms, never framed", () => {
    expect(directive(production, "object-src")).toBe("object-src 'self' blob:");
    expect(directive(production, "base-uri")).toBe("base-uri 'self'");
    expect(directive(production, "form-action")).toBe("form-action 'self'");
    expect(directive(production, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(production, "default-src")).toBe("default-src 'self'");
    expect(directive(production, "upgrade-insecure-requests")).toBe("upgrade-insecure-requests");
  });

  it("lets the résumé preview draw into a blob iframe, and inline style attributes render", () => {
    expect(directive(production, "frame-src")).toBe("frame-src 'self' blob:");
    expect(directive(production, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(production, "img-src")).toBe("img-src 'self' data: blob:");
  });

  it("relaxes only what development needs, and only there", () => {
    const development = buildContentSecurityPolicy({
      nonce: "n",
      supabaseUrl: "http://127.0.0.1:54321",
      isDevelopment: true,
      isSecure: false,
    });
    expect(directive(development, "script-src")).toContain("'unsafe-eval'");
    expect(directive(development, "connect-src")).toBe("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 ws: wss:");
    expect(directive(development, "upgrade-insecure-requests")).toBeNull();
  });

  it("copes with a deployment that has no Supabase URL, or a malformed one", () => {
    const none = buildContentSecurityPolicy({ nonce: "n", supabaseUrl: null, isDevelopment: false, isSecure: true });
    expect(directive(none, "connect-src")).toBe("connect-src 'self'");
    const bad = buildContentSecurityPolicy({ nonce: "n", supabaseUrl: "not a url", isDevelopment: false, isSecure: true });
    expect(directive(bad, "connect-src")).toBe("connect-src 'self'");
  });
});
