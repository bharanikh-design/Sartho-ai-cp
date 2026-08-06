import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

describe("Supabase auth proxy", () => {
  it.each(["/", "/login"])(
    "recovers an OAuth code that lands on %s",
    async (pathname) => {
      const request = new NextRequest(
        `https://sartho.vercel.app${pathname}?code=one-time-code&next=%2F%3Fcode%3Dstale`,
      );

      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://sartho.vercel.app/auth/callback?code=one-time-code&next=%2F",
      );
    },
  );
});
