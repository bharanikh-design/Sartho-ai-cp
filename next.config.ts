import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    // Keep file tracing inside this application when parent folders contain
    // unrelated lockfiles.
    root: process.cwd(),
  },
  images: {
    /*
     * Next only honours qualities listed here; anything else silently falls
     * back to 75. The brand mark is a small, detailed shape sitting on a dark
     * gradient, where JPEG ringing around its edges is the first thing you
     * notice, so it asks for 95 and needs that to actually be allowed.
     */
    qualities: [95],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;
