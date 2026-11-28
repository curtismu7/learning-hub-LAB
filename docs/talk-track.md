# Talk track — Learning Hub LAB

Two minutes. An infrastructure tool, not a story. Say first: "This is a read-only hub that merges the learning content the demos ship — mock only, no accounts, no tenant, no LLM. Search is offline lexical, not RAG."

1. **The packs.** Open **Packs**. "Each demo ships a content pack — validated against one schema, merged here. Two real packs ship today: the ID-JAG kit's and the Privilege demo's. The status page shows what loaded and lets you reload."
2. **Home and search.** "One index across every pack. Press `/` for quick-search and type a term."
3. **A shared term.** Search for "Actor token (act)" and open the Glossary term. "Both packs define it — the hub shows each demo's definition side by side instead of picking a winner."
4. **Cards and sources.** Flip to **Cards**, then **Sources**. "Cards are the teachable units; Sources says where every claim came from. Links open the owning demo straight from the pack."
5. **Presenter mode.** Turn it on. "Bigger type, calmer chrome — for showing, not browsing."

## Notes for the presenter

- Not built in v1: RAG Q&A, no answers, no embeddings; `documents[]` in a pack is validated but not read. Say "lexical only" if search quality comes up.
- Run: `npm start`; e2e via `npm run e2e` (by hand, not CI).
