# .claude

Project-level Claude Code configuration, shared with the team through git.

## Installed skills and agents

When anything here disagrees with `CLAUDE.md` or `docs/`, follow `CLAUDE.md` and `docs/`. Several ECC files assume TypeScript, Supabase, ORMs or Next.js. Our stack uses raw SQL through `pg`.

### Skills (`.claude/skills/`)

| Skill | Source | When to use |
|---|---|---|
| `playwright-cli` | [microsoft/playwright-cli](https://www.npmjs.com/package/@playwright/cli) (installed with `playwright-cli install --skills`) | Drive a real browser to click through and debug our flows; needs `npm i -g @playwright/cli`. |
| `ui-ux-pro-max` | [ui-ux-pro-max-cli](https://www.npmjs.com/package/ui-ux-pro-max-cli) (`uipro init --ai claude`) | Choose a design system, palette, fonts and UX rules for new pages; its search script needs Python 3. |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Review finished UI code against Vercel's Web Interface Guidelines (fetches the latest rules each run). |
| `backend-patterns` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Structure Express routes, services, error handling, retries and logging. |
| `postgres-patterns` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Pick indexes, data types and query shapes for PostgreSQL. |
| `database-migrations` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Write safe schema and data migrations (the plain-SQL sections only). |
| `security-review` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Checklist for auth, input validation, secrets, XSS, CSRF and rate limiting. |
| `react-patterns` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Hooks, state placement, composition and accessibility in React components. |
| `react-testing` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Component and hook tests with React Testing Library, Vitest and MSW. |
| `vite-patterns` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Vite config, env vars, dev proxy to the Express API, and build tuning. |
| `e2e-testing` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Write and stabilise Playwright end-to-end test suites. |

### Agents (`.claude/agents/`)

| Agent | Source | When to use |
|---|---|---|
| `typescript-reviewer` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Review JS/Node/Express changes for async bugs, error handling and security. |
| `react-reviewer` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Review `.jsx` changes for hook rules, accessibility and render performance. |
| `security-reviewer` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Audit endpoints, auth and input handling against the OWASP Top 10. |
| `database-reviewer` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Review PostgreSQL schemas, queries, indexes and migrations. |
| `rag-pipeline-reviewer` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Review the chatbot's pgvector retrieval, chunking, grounding and evaluation. |
| `silent-failure-hunter` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | Find swallowed errors and misleading fallbacks around external API calls (NFR-2). |
