import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /*
     * eslint-plugin-react (bundled via eslint-config-next) tries to sniff the
     * React version off the rule context, using an ESLint 9 API that ESLint 10
     * removed. Left to itself it throws before a single file is linted. Naming
     * the version outright skips that detection path entirely.
     */
    settings: { react: { version: "19.2.8" } },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
