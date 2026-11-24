# CLAUDE.md

Learning Hub (tier Tool). A local, read-only hub that validates and merges the content packs the demos ship (`demo-content-pack/1`) and serves one index and offline BM25 search. Mock only: no accounts, no tenant, no secrets, no outbound calls. Overview and API: [README.md](README.md). Pack format: [docs/pack-authors.md](docs/pack-authors.md).

## Commands

```sh
npm ci
npm test            # server (node) + web (vitest)
npm run build       # web into web/dist
npm run doctor      # preflight
npm run validate-pack -- <file>
npm run e2e         # Playwright by hand, not in CI
npm start           # http://127.0.0.1:4600 (build first)
docker compose up --build -d   # OrbStack; published on 127.0.0.1:4600 only
```

## Rules that bite here

- Rulebook: `~/Development/STANDALONE-RULES.md` (use the `standalone-demo` skill). Packs are data: every pack string leaves as JSON, never HTML; no tenant ids, client ids, private hosts or customer names in a pack (only `.example` / `.invalid`).
- Loopback only, Host check on every request. Compose publishes `127.0.0.1` only. Docker is OrbStack, never Docker Desktop.
- The packaged `packs/` are snapshots addressed relative to the repo root: never add an absolute path (the one test that reads the Privilege demo README takes it from `PRIVILEGE_DEMO_README` and skips when unset).
- CI: Node 26, GitHub-hosted. The forbidden-strings job needs the `FORBIDDEN_STRINGS` repo secret (owner sets it). Never print the list. No AI attribution in commits, PRs or files.
- Known gaps against the rulebook (not done here): `/api/health` is `{ok, mode}`, not `demo-health/1`; no Story mode, no `docs/shelf-entry.json`; Dockerfile still uses Node 22.
