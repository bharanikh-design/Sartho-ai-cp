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
    rules: {
      /*
       * An underscore means "deliberately unused", and the codebase already
       * uses it that way — getPrimaryNavigation keeps its `_activated`
       * parameter because its tests assert the navigation is the same either
       * way, which is a decision worth holding in the signature.
       *
       * Without this, that placeholder was reported alongside genuinely dead
       * code, and a warning list that contains things nobody intends to fix is
       * a warning list people stop reading.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
