import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Playwright owns e2e/ — its specs use @playwright/test and must not be
    // collected by Vitest (they fail at import).
    // '.claude/**' skips git worktrees the harness leaves under .claude/worktrees
    // — vitest would otherwise run a stale duplicate of the suite from them.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
