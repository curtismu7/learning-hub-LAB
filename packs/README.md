# packs/

Content packs the hub ships with, in format `demo-content-pack/1`.

## privilege-demo.pack.json

Written by hand (no generator script) from the Privilege demo repo (v0.3.0), which was read and not edited:

- Glossary: `docs/architecture.md`, `docs/add-a-policy.md`, `docs/security.md`, `docs/group-to-tool-mapping.md`, and the policy files in `server/src/cedar/policies/`. The Cedar reading of the claim mapping also follows `planning/standalone-research/cedar.md` in AI-DEMO2.
- Stories S01, S04, S05, S23: the one-line `say` and the title come from `web/src/data/stories/*.json`. `file` is a pointer into that repo, not a copy.
- Sources: only URLs that appear in the demo's docs. The one external URL they cite is `https://www.cedarpolicy.com/` (its README). It was not fetched, so its status is `not-read`.
- `demo.baseUrl` is that README's Docker URL (`http://localhost:18080`). Card routes are the page paths in `web/src/main.jsx`.
- "Actor token (act)" uses the same term text as the ID-JAG kit's pack on purpose: the hub shows both definitions side by side.

To refresh it, re-read those files and edit the JSON. The server suite (`server/src/__tests__/shipped-packs.test.js`) checks that the pack validates, is registered, cites only URLs found in the privilege-demo README, and merges with the ID-JAG pack.
Validate by hand with `npm run validate-pack -- packs/privilege-demo.pack.json`.
