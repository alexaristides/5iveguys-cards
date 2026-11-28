// ESLint for the website (`npm run lint` → `next lint`, and `next build`).
// The iOS app has its own config in mobile/eslint.config.js.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "mobile/**", // the Expo app, linted from mobile/ with `npx expo lint`
      "public/street/**", // generated 5IVE STREET bundle (npm run build:street in mobile/)
      ".claude/worktrees/**", // other checkouts of this repo
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // A leading underscore marks something unused on purpose (`_req`, `(gk, _b) => …`, `{ bonus: _bonus, ...rest }`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];

export default eslintConfig;
