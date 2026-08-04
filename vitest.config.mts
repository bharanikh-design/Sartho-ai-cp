import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    // Honours the "@/*" paths already declared in tsconfig.json rather than
    // repeating them here and letting the two drift apart.
    tsconfigPaths: true,
  },
});
