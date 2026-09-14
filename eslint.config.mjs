import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// ============================================
// A LINTER THAT IS ALLOWED TO FAIL THE BUILD
// ============================================
// This config was the stock Next preset, unmodified, and nothing ever ran it:
// there is no lint step in .github/workflows/ci.yml and Next 16 no longer
// lints during `next build`. `npm run lint` reported 4508 problems — 3149 of
// them errors — so it was a report nobody could act on, and it could never
// catch a regression because it had never been green.
//
// 2966 of those 3149 errors were one rule: no-explicit-any. Fixing them is a
// three-thousand-change mechanical diff across the whole app, with real
// regression risk and little to show for it — and while that rule stays an
// error, every OTHER error is invisible in the noise. Among those others were
// six genuine React hook-order violations.
//
// So the rule is demoted to a warning: still reported, still discouraged,
// never a merge blocker. What remains as an error is what the codebase
// actually holds to, and CI now runs it (`npm run lint`, which exits non-zero
// on errors and ignores warnings).
//
// Demoting a rule is a decision to be made once, in the open, with a reason —
// not by adding eslint-disable comments at each site, which hides the count
// and lets it grow unseen. If the `any` debt is ever paid down, delete this
// block and the rule returns to an error on its own.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Throwaway one-off scripts, not shipped code. They are gitignored
      // anyway; naming them here keeps a local scratch file from failing CI
      // for somebody else.
      "scratchpad/**",
      // Git worktrees the agent harness leaves behind. Without this, eslint
      // lints a STALE DUPLICATE of the whole app and reports every problem
      // twice — half the errors found when this gate was built came from a
      // worktree nobody had opened in weeks. vitest.config.ts already excludes
      // these for the same reason; the linter had simply never been run often
      // enough for anyone to notice.
      ".claude/**",
    ],
  },
  {
    rules: {
      // 2966 occurrences. See the note above: a warning, not a gate.
      "@typescript-eslint/no-explicit-any": "warn",

      // Narrowed, not disabled. This rule guards four characters; by default
      // that includes ' and ", which React has rendered correctly in JSX text
      // for years. All 110 errors here were apostrophes and quotation marks in
      // ordinary prose — escaping them to &apos; and &quot; would make 110
      // readable strings less readable and change nothing that renders.
      //
      // > and } are a different matter: a bare one in JSX text is almost
      // always a broken tag or an unclosed expression, which is a real defect
      // and stays an error.
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
    },
  },
];

export default eslintConfig;
