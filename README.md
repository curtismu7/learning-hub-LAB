# Learning Hub

**Tier: Tool.** Infrastructure for the demo family: it merges the content packs the demos ship. Read-only, mock only, no accounts, no tenant.

A local, read-only hub that merges the learning content of many demos. Each demo ships a content pack
(`content-pack.json`, format `demo-content-pack/1`, schema in `server/schema/content-pack.schema.json`, a copy of the
ID-JAG kit's `docs/content-pack.schema.json`). The hub validates every pack, merges them, and serves one index and search.

## Status (honest)

Built and tested: the pack registry, validation, merge, offline lexical (BM25) search, the read-only JSON API, and the web
app (Home, Glossary with term pages and `#term-<id>` deep links, Sources, Cards, Search with a `/` quick-search, Packs
status with reload, presenter mode). Two real packs ship: the ID-JAG kit's and the Privilege demo's
(`packs/privilege-demo.pack.json`); a term both define (for example "Actor token (act)") shows each demo's definition side by
side. Pack and card links open the demo from the pack's `demo.baseUrl`, or from the SE demo shelf registry when `HUB_SHELF_URL`
is set. A browser script (`npm run e2e`) drives it end to end; it is run by hand and is not in CI.

Not built: no RAG Q&A in v1 (no answers, no LLM, no embeddings); search is offline lexical only. No Learn tabs. `documents[]`
in a pack is validated but not read. No live status lights or start buttons (that is the demo shelf's job). Not verified: the hub has
only been run on one macOS machine, and the shelf link-out has been tested against a fixture shelf file, not a running
shelf. Machine-specific paths: every shipped pack, including the ID-JAG kit's (`packs/id-jag.pack.json`), is a snapshot addressed relative to
the repo root, so a clean clone reads its own copy. Override or add packs in `.data/packs.local.json` (see Packs).

Docs: [docs/pack-authors.md](docs/pack-authors.md) (how a demo ships a pack), [docs/merge-rules.md](docs/merge-rules.md),
[docs/security.md](docs/security.md), [packs/README.md](packs/README.md).

## Run

```
npm install
npm test        # server + web
npm run build   # web
npm run doctor  # Node, port, registry, every pack
npm start       # API on http://127.0.0.1:4600 (serves web/dist if built)
npm run dev     # API :4600 + Vite :4601
npm run validate-pack -- packs/privilege-demo.pack.json   # check a pack the way the hub does
npm run e2e     # browser run against both real packs + fixtures (needs `npm run build`, a Chromium or Chrome; screenshots to e2e-output/)
```

Open http://127.0.0.1:4600 after `npm run build && npm start`. Set `HUB_PORT` if 4600 is taken.

## Packs

`data/packs.json` lists packs: `{ "packs": [{ "id": "id-jag", "source": "<absolute .json path or loopback http(s) URL>" }] }`.
A source may also be a `.json` path relative to the repo root (for example `packs/privilege-demo.pack.json`); it is resolved at
load time, may not contain `..`, and its real path must stay inside the repo. Absolute paths are the only form for files outside it.
Local overrides go in `.data/packs.local.json` (same shape; the same `id` replaces the shipped entry, new ids are appended).
Example, pointing `id-jag` at your own checkout:

```json
{ "packs": [{ "id": "id-jag", "source": "/path/to/your/id-jag-standalone/content-pack.json" }] }
```
Optional top-level `"displayDefinitions": { "<normalised term>": "<pack id>" }` chooses which pack's definition is shown for a term
(default: first pack in registry order). See [docs/merge-rules.md](docs/merge-rules.md).

`HUB_SHELF_URL` (optional, in `.env`): absolute path of the SE demo shelf's registry file (the shelf repo's `data/demos.json`).
Each entry's `url` replaces the matching pack's `demo.baseUrl` (matched by the entry's `catalogId` against the pack's
`demo.catalog`, then `id` against `demo.id`). The pack cards on Home and Cards then link to that address. Bad entries are
shown on the Packs page and ignored.

A source that is relative, has `..`, shell characters or a non-`.json` name, or a non-loopback URL, is rejected.
An invalid pack (schema, version, size over 5 MB, bad link, dangling reference, duplicate pack id) is reported by
`GET /api/packs` and excluded; the rest keep working. The pack's text is never rendered as HTML.


### Refreshing the demo packs

`npm run refresh-packs` snapshots each demo's published pack (read from `origin/main` of the sibling checkout, never the working tree) into
`packs/<id>.pack.json`, validates it exactly as the hub does, and registers it in `data/packs.json`. The list of demos is
`data/pack-sources.json`. Flags: `--no-fetch` (skip `git fetch`), `--only=<id>`, `--dry-run`. An invalid pack is reported and skipped; its
previous snapshot stays. Set `DEMO_REPOS_DIR` if the demo checkouts are not next to this repo. Re-run it when a demo publishes a new pack,
then commit the changed snapshots.

## Hosting the mock

`MOCK_ONLY=1` serves only packs packaged in this repo (relative `packs/*.json` entries in `data/packs.json`), makes no outbound requests, and refuses every non-GET `/api` call with 403. Defaults stay loopback-only; a hosted copy opts in explicitly:

```
MOCK_ONLY=1
HUB_BIND=0.0.0.0                        # a non-loopback bind is never enabled automatically
HUB_ALLOWED_HOSTS=hub.example.com       # comma-separated Host names (port ignored); every other Host gets 403 host_not_allowed
HUB_PORT=4600
```

With `MOCK_ONLY=1` and a non-loopback `HUB_BIND`, the server refuses to start unless `HUB_ALLOWED_HOSTS` is set. Without these settings it binds 127.0.0.1 and answers only loopback Host names.
Readiness probe: `GET /api/health` returns `{"ok":true,"mode":"mock-only"}`. The probe must send an allowed `Host` header (for Kubernetes, set `httpGet.httpHeaders: [{name: Host, value: hub.example.com}]`), otherwise it gets 403.
In mock mode, demo links that point at localhost / 127.x render as plain text with "(local demo only)".

Do not bake a `.env` into an image: mock mode does not read one, and the image should carry only code, `data/`, `packs/` and the built `web/dist`. Run the container as a non-root user. The image is built from the `Dockerfile` here; `docker compose up --build -d` publishes it on `127.0.0.1` only.

All packs, including ID-JAG, are packaged under `packs/` with relative entries, so a hosted mock loads every one and `registryProblems` is `[]`. Under `MOCK_ONLY=1`, `GET /api/packs` reports each `source` relative to the repo root, never a server path.

`MOCK_ONLY` is this family's env switch for hosted-mock mode (the rulebook's `MODE=mock`). The hub is stateless and read-only on the server: it keeps no per-workspace or per-visitor state, so per-session isolation (rules 13 and 18) holds by having nothing to isolate.

Kubelet probes must send a `Host` header taken from `HUB_ALLOWED_HOSTS` (`httpGet.httpHeaders: [{name: Host, value: hub.example.com}]`), or `/api/health` answers 403 and the pod never becomes ready.

## API (read-only; binds 127.0.0.1 unless `HUB_BIND` is set)

- `GET /api/packs` status of each registered pack (`ok`/`invalid`, problems, counts, version)
- `GET /api/hub` merged glossary / sources / cards / diagrams / stories; ids are `<packId>.<id>`
- `GET /api/search?q=&limit=` BM25 results; snippets carry match offsets (UTF-16), never HTML
- `GET /api/terms/:id` one term with every demo's definition and the cards that teach it
- `POST /api/reload` re-read packs (5 per minute)

No accounts, no secrets. Ports used here are 4600 (API) and 4601 (Vite dev).
