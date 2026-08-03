import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /*
     * Next only honours qualities listed here; anything else silently falls
     * back to 75. The brand mark is a small, detailed shape sitting on a dark
     * gradient, where JPEG ringing around its edges is the first thing you
     * notice, so it asks for 95 and needs that to actually be allowed.
     */
    qualities: [95],
  },
};

export default nextConfig;
