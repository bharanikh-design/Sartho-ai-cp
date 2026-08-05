import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Route handlers are tested too — the seam between the server's stream
    // and the client's parser is not visible from either side alone.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    // Honours the "@/*" paths already declared in tsconfig.json rather than
    // repeating them here and letting the two drift apart.
    tsconfigPaths: true,
  },
});
