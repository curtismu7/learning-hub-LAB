# Merge rules

The hub loads packs in registry order (`data/packs.json`, then `.data/packs.local.json`) and merges the valid ones into one
read-only index. Nothing is written back to a pack.

## Namespacing

Every id is prefixed with its pack id and a dot: pack `id-jag` term `actor-token` is `id-jag.actor-token`. A pack's ids
cannot contain a dot, so a prefixed id is unambiguous. Two packs may use the same item id; they never collide.
A pack `id` must be unique across the hub: if two registry entries load packs with the same `id`, the second is refused
and reported on the Packs page.

## Glossary: per-demo definitions

Terms are grouped by their text after normalisation (Unicode NFKC, lower case, runs of whitespace collapsed to one space).
"Actor token (act)" in two packs is one entry with two definitions. "DPoP" and "DPoP (RFC 9449)" are different text, so
they are two entries; align the term text between demos if you want them merged (aliases are searchable but do not merge).

- Every demo's definition is kept, attributed to its pack, and shown side by side on the term page (`/glossary/<id>`).
- **Display definition**: the one shown in the glossary list and marked "shown by default". It is the definition from the
  first pack in registry order. To pick another, set `displayDefinitions` in the registry file:
  `"displayDefinitions": { "actor token (act)": "privilege" }` (key is the normalised term, value is a pack id). A pack id that does not define the term is ignored.
- The merged entry's own id is the namespaced id of the first pack that defined the term (`id-jag.actor-token`), whatever
  the display choice. The term page and the `#term-<id>` deep link use it, and the term page also resolves any other
  definition's id, so a link built from either demo's id still opens the page.

## Sources

Sources with the same link (scheme, host, path and query; the fragment and a trailing slash are ignored) merge into one
entry listing both packs. Where the two disagree, the worse `status` and the older `checked` date win, so a stale copy never
makes a link look fresher or better read than it is. The other copy's id is kept as an alias.

## Cards, diagrams, stories

These are never merged. Each keeps its pack and is shown under that pack. A card's `terms` are rewritten to namespaced ids and
the card is listed on the term page of each term it teaches. The card link is the demo address (pack `baseUrl`, or the shelf's
address when `HUB_SHELF_URL` is set) plus the card's `href`; with no address the card shows its route as text.

## Collisions at a glance

| Situation | Result |
|---|---|
| Same item id in two packs | fine, namespaced apart |
| Same term text in two packs | one entry, both definitions side by side |
| Same source URL in two packs | one entry, both packs listed, worst status wins |
| Same pack id in two registry entries | second refused, reported |
| A pack fails validation | that pack excluded, others unaffected |
