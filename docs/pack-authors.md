# Shipping a content pack from a demo

A demo teaches the hub what it teaches by shipping one file, `content-pack.json`, at its repo root. The hub reads it; the
demo does not import anything from the hub. Format: `demo-content-pack/1`. Schema: `server/schema/content-pack.schema.json`
(a copy of the ID-JAG kit's `docs/content-pack.schema.json`; keep the two in step).

## Fields

Required: `schema`, `id`, `title`, `version`, `demo`, `glossary`, `sources`, `cards`. Optional: `source`, `diagrams`, `stories`, `documents`.
No other top-level field is allowed.

| Field | Rules |
|---|---|
| `schema` | exactly `"demo-content-pack/1"`; any other value is refused by name |
| `id` | slug `^[a-z][a-z0-9-]{1,40}$`; unique in the hub; namespaces every id as `<id>.<item id>` |
| `title`, `version` | text; `version` is `x.y.z` |
| `demo` | `{ id, name, catalog }` plus optional `baseUrl`, `doctor`, `tags`. `catalog` is the family-plan id such as `C1` |
| `glossary[]` | `{ id, term, definition, aliases? }`. Terms in two packs with the same text (case, spacing and Unicode form ignored) become one entry with each demo's definition kept |
| `sources[]` | `{ id, title, url, kind, use, status, checked }`. `status` is `verified`, `read`, `search-only` or `not-read`; `checked` is a date |
| `cards[]` | `{ id, label, group, action, description?, terms?, story? }`. `group` is `setup`, `try-it`, `concept` or `reference`; `action` is `{ type: "route", href: "/path" }` or `{ type: "external", href: "https://..." }`; `terms` are glossary ids of this pack; `story` is a story id of this pack; optional `wire` (below) |
| `diagrams[]` | `{ id, label, href, mode? }`; `href` is a path in the demo |
| `stories[]` | `{ id, title, say?, file? }`; `id` looks like `S01`. A pointer and a one-line takeaway, not the story |
| `documents[]` | accepted and validated, not read in this version |

### The optional "On the wire" block (`cards[].wire`)

A card may carry `wire: { intro, steps[], links? }`; a card without it renders as before. Each step is `{ title, notice, between?, quiet?, request?, response?, token?, jargon? }`.
`request` and `response` are `{ line, headers?, body? }` (the request line, or the status line). `token` is `{ label, header[], claims[], signature }`, where each row is `{ name, value, note, focus? }`:
the hub builds the raw `header.payload.signature` text from the rows, so the pack never contains a token-shaped string. `notice` is the "what to notice" line; `jargon` is `{ term, meaning }` for the collapsible word list.
Rules the hub enforces: `signature` is exactly `sig-not-real`; every `http(s)` URL in a message or claim has an example host (`example.com/.org/.net`, `.example`, `.invalid`, `.test`); a step with no request and no response needs `quiet` saying no traffic happens; links are http(s). Start `intro` with "Example data" and use fake ids (`client-not-real`). The packs in `packs/` are snapshots: copy a wire block into the demo's own `content-pack.json` too, or `npm run refresh-packs` will drop it.

### Where the demo's address comes from

`demo.baseUrl` is the demo's default local URL (http or https, no credentials, never a tenant URL). The hub joins it to a
card's `href` for the "Open in the demo" link. If the SE demo shelf is configured (`HUB_SHELF_URL`, see the README) the
shelf's address for that demo replaces `baseUrl`, matched by `demo.catalog` and then by `demo.id`. The schema has no
`demo.url`; `baseUrl` is that field.

## Rules a schema cannot express (the hub checks them too)

- Ids are `[A-Za-z0-9_-]`, at most 81 characters, and **contain no dot** (the dot is the namespace separator). Ids are unique within their list.
- Links: `sources[].url`, external card `href`, `demo.baseUrl` must be http(s) with no username or password. Route `href`, diagram `href` and `demo.doctor` must start with a single `/`. A `javascript:` or `data:` link makes the pack invalid.
- Every `cards[].terms` entry must be a glossary id; `cards[].story` must be a story id; `documents[].sourceId` must be a source id.
- Size: the file is at most 5 MiB; any string at most 8000 characters; any list at most 5000 items. No control characters in strings.
- No token-shaped values: a string that looks like a JWT is refused. Never put a secret, a tenant id or a private hostname in a pack.
- Text is plain text. The hub never renders it as HTML.

## Validate

```
npm run validate-pack -- path/to/content-pack.json
```

This runs the same loader the hub uses and prints `PASS` or `FAIL` with each problem; exit code 1 on failure.
`npm run doctor` checks every registered pack the same way.

## A short example (23 lines)

```json
{
  "schema": "demo-content-pack/1",
  "id": "my-demo",
  "title": "My demo",
  "version": "0.1.0",
  "demo": { "id": "my-demo", "name": "My demo", "catalog": "Z1", "baseUrl": "http://localhost:4700" },
  "glossary": [
    { "id": "pep", "term": "PEP", "definition": "The code in front of a tool that asks a policy engine and then allows, denies or holds the call." }
  ],
  "sources": [
    {
      "id": "cedar", "title": "Cedar policy language", "url": "https://www.cedarpolicy.com/",
      "kind": "Reference", "use": "Language reference for the policies.", "status": "not-read", "checked": "2026-10-21"
    }
  ],
  "cards": [
    {
      "id": "try-pep", "label": "Watch the PEP decide", "group": "try-it",
      "action": { "type": "route", "href": "/console" }, "terms": ["pep"], "story": "S01"
    }
  ],
  "stories": [{ "id": "S01", "title": "A call is held", "say": "A human stayed in the loop for the risky one." }]
}
```

## How a demo keeps it current

Generate it from the demo's own data and add a test that fails when the committed file differs from the generator output
(the ID-JAG kit does this: `docs/content-pack.md` there). Hand-written is fine for a small demo; this hub's Privilege pack
is hand-written, see `packs/README.md`. Do not edit another demo's repo from the hub: the pack for a demo lives in that demo,
or, until it does, in this repo's `packs/`.

## Register it with the hub

Add `{ "id": "my-demo", "source": "/absolute/path/content-pack.json" }` to `.data/packs.local.json` (git-ignored) or to
`data/packs.json`. Source is an absolute `.json` path, a `.json` path relative to the repo root (inside the repo only), or an `http(s)` URL on loopback. Absolute paths in `data/packs.json` are machine-specific; prefer `.data/packs.local.json`. See the README.

## What the hub does with an invalid pack

The hub excludes only that pack. The rest keep working. The pack shows as `invalid` on the Home page and the Packs page with
the first problems (at most 20), and a banner on every page names it (hidden in presenter mode). Nothing from an invalid
pack is searchable. After you fix the file, press "Reload packs" on the Packs page (or `POST /api/reload`). Causes: schema
errors, a different `schema` version, a file over 5 MiB, a bad link, a dangling `terms` or `story` reference, a duplicate
id, a pack `id` already provided by an earlier registry entry (the second one is refused), an unreadable file.
