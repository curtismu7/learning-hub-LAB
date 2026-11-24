import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const def = (id, packId, term, definition, aliases = []) => ({ id, packId, term, definition, aliases });
const HUB = {
  packs: [
    { id: "alpha", title: "ALPHA demo", version: "1.0.0", demo: { id: "a", name: "alpha demo", baseUrl: "http://localhost:4999" }, counts: { glossary: 2, sources: 1, cards: 1, diagrams: 1, stories: 1 } },
    { id: "beta", title: "BETA demo", version: "2.1.0", demo: { id: "b", name: "beta demo", baseUrl: null }, counts: { glossary: 1, sources: 0, cards: 0, diagrams: 0, stories: 0 } },
  ],
  glossary: [
    { id: "alpha.jti", key: "jti replay", term: "jti replay", display: "alpha.jti", definitions: [def("alpha.jti", "alpha", "jti replay", "A token identifier that servers remember.")], cards: [] },
    { id: "alpha.dpop", key: "dpop", term: "DPoP", display: "alpha.dpop", cards: ["alpha.try"],
      definitions: [def("alpha.dpop", "alpha", "DPoP", "Alpha says: binds a token to a key.", ["proof of possession"]), def("beta.dpop", "beta", "DPoP", "Beta says: sender-constrained tokens.")] },
  ],
  sources: [
    { id: "alpha.rfc9449", packIds: ["alpha"], title: "RFC 9449 DPoP", url: "https://www.rfc-editor.org/rfc/rfc9449", kind: "Spec", use: "Defines DPoP proofs.", status: "read", checked: "2026-10-10" },
    { id: "alpha.bad", packIds: ["alpha"], title: "Odd link", url: "javascript:alert(1)", kind: "Blog", use: "u", status: "read", checked: "2026-10-10" },
  ],
  cards: [{ id: "alpha.try", packId: "alpha", label: "Try DPoP", description: "Run the DPoP demo.", group: "try-it", action: { type: "route", href: "/dpop" }, url: "http://localhost:4999/dpop", terms: ["alpha.dpop"], story: "alpha.S01" }],
  diagrams: [{ id: "alpha.flow", packId: "alpha", label: "DPoP flow", href: "/diagram/dpop", mode: "dpop" }],
  stories: [{ id: "alpha.S01", packId: "alpha", title: "Ana proves possession", say: "The token is useless without the key." }],
};
const PACKS = {
  registryProblems: [],
  packs: [
    { id: "alpha", status: "ok", problems: [], packId: "alpha", version: "1.0.0", counts: HUB.packs[0].counts },
    { id: "beta", status: "ok", problems: [], packId: "beta", version: "2.1.0", counts: HUB.packs[1].counts },
  ],
};
const BAD = { ...PACKS, packs: [...PACKS.packs, { id: "broken", status: "invalid", problems: ["/glossary/0: must have required property 'term'"] }] };
const SEARCH = {
  query: "dpop", results: [
    { id: "alpha.dpop", kind: "term", packId: "alpha", title: "DPoP", score: 3, titleMatches: [{ start: 0, end: 4 }], snippet: { text: "Alpha says: binds a token to a key.", matches: [{ start: 20, end: 25 }], truncatedStart: true, truncatedEnd: true } },
    { id: "alpha.try", kind: "card", packId: "alpha", title: "Try DPoP", score: 2, titleMatches: [{ start: 4, end: 8 }], snippet: { text: "Run the DPoP demo.", matches: [{ start: 8, end: 12 }], truncatedStart: false, truncatedEnd: false } },
  ],
};

let calls;
let mockMode = false;
function mockApi({ hub = HUB, packs = PACKS, search = SEARCH, reloadStatus = 200 } = {}) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push([String(url), init?.method || "GET"]);
    const u = String(url);
    const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.startsWith("/api/hub")) return ok(hub);
    if (u.startsWith("/api/packs")) return ok(packs);
    if (u.startsWith("/api/search")) return ok(search);
    if (u.startsWith("/api/health")) return ok({ ok: true, mode: mockMode ? "mock-only" : "normal" });
    if (u.startsWith("/api/reload")) return ok({}, reloadStatus);
    return ok({}, 404);
  });
}
const open = async (url = "/") => {
  window.history.replaceState(null, "", url);
  render(<App />);
  await screen.findByRole("main");
  await waitFor(() => expect(screen.queryByText("Loading")).toBeNull());
};

beforeEach(() => { mockMode = false; localStorage.clear(); delete document.documentElement.dataset.present; Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("home", () => {
  it("shows one card per pack with version, counts and health, and a search box", async () => {
    mockApi({ packs: BAD });
    await open("/");
    const cards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(cards).toEqual(["ALPHA demo", "BETA demo", "broken"]);
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v2\.1\.0/)).toBeInTheDocument();
    expect(screen.getAllByText("ok")).toHaveLength(2);
    expect(screen.getAllByText("invalid").length).toBeGreaterThan(0);
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
  it("a pack with a demo address gets an Open the demo link; a pack without one does not", async () => {
    mockApi();
    await open("/");
    const links = screen.getAllByRole("link", { name: "Open the demo" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "http://localhost:4999");
    expect(links[0]).toHaveAttribute("target", "_blank");
  });
  it("submitting the search box goes to the results page", async () => {
    mockApi();
    await open("/");
    await userEvent.type(within(screen.getByRole("search")).getByLabelText(/Search terms/), "dpop{Enter}");
    expect(window.location.pathname + window.location.search).toBe("/search?q=dpop");
    expect(await screen.findByText("2 results for \"dpop\"")).toBeInTheDocument();
  });
});

describe("glossary", () => {
  it("lists terms alphabetically, filters, and says how many show", async () => {
    mockApi();
    await open("/glossary");
    const names = () => screen.getAllByRole("term").map((t) => t.textContent);
    expect(names()).toEqual(["DPoP · 2 demos", "jti replay"]);
    expect(screen.getByText("2 of 2 terms")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Filter terms"), "proof of poss");
    expect(names()).toEqual(["DPoP · 2 demos"]);
    expect(screen.getByText("1 of 2 terms")).toBeInTheDocument();
  });
  it("the term page shows every demo's definition side by side and marks the displayed one", async () => {
    mockApi();
    await open("/glossary/alpha.dpop");
    expect(screen.getByRole("heading", { level: 1, name: "DPoP" })).toBeInTheDocument();
    const defs = screen.getAllByRole("listitem").filter((li) => li.classList.contains("card"));
    expect(defs).toHaveLength(2);
    expect(defs[0]).toHaveTextContent("Alpha says");
    expect(defs[0]).toHaveTextContent("shown by default");
    expect(defs[1]).toHaveTextContent("Beta says");
    expect(defs[1]).not.toHaveTextContent("shown by default");
    expect(screen.getByRole("link", { name: "Try DPoP" })).toHaveAttribute("href", "/cards#card-alpha.try");
    const diagram = screen.getByRole("link", { name: "DPoP flow" });
    expect(diagram).toHaveAttribute("href", "http://localhost:4999/diagram/dpop");
    expect(diagram).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("a term page also resolves a non-displayed definition id, and unknown ids say so", async () => {
    mockApi();
    await open("/glossary/beta.dpop");
    expect(screen.getByRole("heading", { level: 1, name: "DPoP" })).toBeInTheDocument();
    cleanup();
    await open("/glossary/nope");
    expect(screen.getByText("Term not found")).toBeInTheDocument();
  });
});

describe("deep links", () => {
  it("#term-<id> scrolls to, focuses and highlights the term", async () => {
    mockApi();
    await open("/glossary#term-alpha.jti");
    const el = document.getElementById("term-alpha.jti");
    await waitFor(() => expect(el).toHaveAttribute("data-hl", "1"));
    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(el);
    expect(document.getElementById("term-alpha.dpop")).not.toHaveAttribute("data-hl");
  });
  it("moves the highlight when the hash changes", async () => {
    mockApi();
    await open("/glossary#term-alpha.jti");
    await waitFor(() => expect(document.getElementById("term-alpha.jti")).toHaveAttribute("data-hl"));
    window.history.pushState(null, "", "/glossary#term-alpha.dpop");
    act(() => { window.dispatchEvent(new Event("hub:navigate")); });
    await waitFor(() => expect(document.getElementById("term-alpha.dpop")).toHaveAttribute("data-hl"));
    expect(document.getElementById("term-alpha.jti")).not.toHaveAttribute("data-hl");
  });
  it("a malformed %-escape in the hash does not blank the app", async () => {
    mockApi();
    await open("/glossary#term-%E0%A4%A");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
  it("a malformed %-escape in a term path shows the page, not a crash", async () => {
    mockApi();
    await open("/glossary/%E0%A4%A");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
  it("card and source anchors work too", async () => {
    mockApi();
    await open("/cards#card-alpha.try");
    await waitFor(() => expect(document.getElementById("card-alpha.try")).toHaveAttribute("data-hl"));
    cleanup();
    await open("/sources#source-alpha.rfc9449");
    await waitFor(() => expect(document.getElementById("source-alpha.rfc9449")).toHaveAttribute("data-hl"));
  });
});

describe("sources and cards", () => {
  it("groups sources by kind; http(s) links open safely in a new tab, other schemes are plain text", async () => {
    mockApi();
    await open("/sources");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Blog", "Spec"]);
    const link = screen.getByRole("link", { name: "RFC 9449 DPoP" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "Odd link" })).toBeNull();
    expect(screen.getByText("Odd link")).toBeInTheDocument();
  });
  it("shows cards with their story step, terms and a link to the demo", async () => {
    mockApi();
    await open("/cards");
    const card = document.getElementById("card-alpha.try");
    expect(card).toHaveTextContent("Run the DPoP demo.");
    expect(card).toHaveTextContent("Ana proves possession.");
    expect(within(card).getByRole("link", { name: "DPoP" })).toHaveAttribute("href", "/glossary/alpha.dpop");
    expect(within(card).getByRole("link", { name: "Open in the demo" })).toHaveAttribute("href", "http://localhost:4999/dpop");
    expect(screen.getByRole("link", { name: "DPoP flow" })).toHaveAttribute("target", "_blank");
  });
  it("the cards page says whether the demo address came from the pack or the shelf", async () => {
    const hub = { ...HUB, packs: [{ ...HUB.packs[0], demo: { ...HUB.packs[0].demo, urlSource: "shelf" } }, HUB.packs[1]] };
    mockApi({ hub });
    await open("/cards");
    expect(screen.getByText("(address from the demo shelf)")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open the demo" })).toHaveLength(1);
  });
});

describe("search", () => {
  it("highlights from the server offsets, announces the count, links to the destination", async () => {
    mockApi();
    await open("/search?q=dpop");
    expect(await screen.findByText('2 results for "dpop"')).toHaveAttribute("aria-live", "polite");
    const marks = [...document.querySelectorAll(".results mark")].map((m) => m.textContent);
    expect(marks).toEqual(["DPoP", "token", "DPoP", "DPoP"]);
    expect(document.querySelector(".results li").textContent).toContain("…Alpha says: binds a token to a key.…");
    expect(screen.getByRole("link", { name: "DPoP" })).toHaveAttribute("href", "/glossary/alpha.dpop");
    expect(screen.getByRole("link", { name: "Try DPoP" })).toHaveAttribute("href", "/cards#card-alpha.try");
    expect(calls.some(([u]) => u.startsWith("/api/search?q=dpop"))).toBe(true);
  });
  it("the shell quick-search takes focus on '/' and not while typing in a field", async () => {
    mockApi();
    await open("/");
    const quick = screen.getByLabelText("Quick search");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(quick);
    await userEvent.type(quick, "dp");
    expect(quick).toHaveValue("dp"); // a '/' typed in the field is text, not a re-focus
    expect(window.location.pathname).toBe("/search");
    await userEvent.type(quick, "/");
    expect(quick).toHaveValue("dp/");
  });
  it("an empty query asks for input and does not call the API", async () => {
    mockApi();
    await open("/search");
    expect(screen.getByText("Type to search.")).toBeInTheDocument();
    expect(calls.some(([u]) => u.startsWith("/api/search"))).toBe(false);
  });
});

describe("packs and invalid-pack banner", () => {
  it("shows a banner on every page when a pack is invalid, and the problem text on Packs", async () => {
    mockApi({ packs: BAD });
    await open("/glossary");
    expect(screen.getByRole("alert")).toHaveTextContent("1 pack failed validation and is left out: broken");
    cleanup();
    await open("/packs");
    const row = screen.getByRole("row", { name: /broken/ });
    expect(row).toHaveTextContent("invalid");
    expect(row).toHaveTextContent("must have required property 'term'");
    expect(screen.getByRole("row", { name: /alpha/ })).toHaveTextContent("1.0.0");
  });
  it("no banner when every pack is ok", async () => {
    mockApi();
    await open("/");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("reload posts and refetches; a 429 is explained", async () => {
    mockApi();
    await open("/packs");
    await userEvent.click(screen.getByRole("button", { name: "Reload packs" }));
    await waitFor(() => expect(calls.filter(([u]) => u === "/api/hub").length).toBe(2));
    expect(calls).toContainEqual(["/api/reload", "POST"]);
    cleanup();
    mockApi({ reloadStatus: 429 });
    await open("/packs");
    await userEvent.click(screen.getByRole("button", { name: "Reload packs" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("limited to 5 per minute");
  });
  it("says so when the API is down", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("down"); });
    window.history.replaceState(null, "", "/");
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not reachable");
  });
});

describe("presenter mode", () => {
  it("hides Packs (nav, table, reload) and the banner; 'p' toggles; the choice is remembered", async () => {
    mockApi({ packs: BAD });
    await open("/packs");
    expect(screen.getByRole("button", { name: "Reload packs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(document.documentElement.dataset.present).toBe("1");
    expect(screen.queryByRole("button", { name: "Reload packs" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link", { name: "Packs" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/hidden in presenter mode/)).toBeInTheDocument();
    expect(localStorage.getItem("learninghub.present")).toBe("1");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(document.documentElement.dataset.present).toBeUndefined();
    expect(screen.getByRole("link", { name: "Packs" })).toBeInTheDocument();
  });
});

describe("on the wire panel", () => {
  const c = (name, value, note, focus) => ({ name, value, note, ...(focus ? { focus } : {}) });
  const WIRE = {
    intro: "Example data, nothing real. A swap.",
    links: [{ label: "RFC 8693", url: "https://www.rfc-editor.org/rfc/rfc8693" }, { label: "Bad", url: "javascript:alert(1)" }],
    steps: [
      { title: "1. Sign in", between: "Person to App", quiet: "Nothing is sent here.", notice: "The app never sees the password." },
      {
        title: "2. Swap", notice: "aud keeps a token to one service.", jargon: [{ term: "aud", meaning: "The service a token is for." }],
        request: { line: "POST https://auth.example.com/token HTTP/1.1", headers: ["Host: auth.example.com"], body: "grant_type=token-exchange" },
        response: { line: "HTTP/1.1 401 Unauthorized" },
        token: { label: "the swapped token", signature: "sig-not-real", header: [c("alg", "RS256", "How it was signed.")], claims: [c("aud", "https://billing.example.com", "Who it is for.", true), c("act", { sub: "agent" }, "Who is acting.")] },
      },
    ],
  };
  const withWire = () => { const hub = structuredClone(HUB); hub.cards[0].wire = WIRE; return hub; };

  it("a card without wire data renders exactly as before (no panel)", async () => {
    mockApi();
    await open("/cards");
    expect(document.querySelector(".wire")).toBeNull();
    expect(screen.queryByText(/On the wire/)).toBeNull();
  });
  it("a card with wire data gets a collapsed panel; opening it shows step 1 as a no-traffic step", async () => {
    mockApi({ hub: withWire() });
    await open("/cards");
    const panel = document.querySelector("#card-alpha\\.try details.wire");
    expect(panel.open).toBe(false);
    panel.open = true;
    expect(within(panel).getByText("Example")).toBeInTheDocument();
    expect(within(panel).getByText(/No network call here/)).toBeInTheDocument();
    expect(within(panel).getByText("Nothing is sent here.")).toBeInTheDocument();
    expect(within(panel).queryByText("Request")).toBeNull();
    expect(within(panel).getByText(/What to notice/).closest("p")).toHaveTextContent("never sees the password");
  });
  it("step 2 shows request, response, the raw token split in three, decoded rows with notes and the focus claim marked", async () => {
    mockApi({ hub: withWire() });
    await open("/cards");
    const panel = document.querySelector("#card-alpha\\.try details.wire");
    await userEvent.click(within(panel).getByRole("button", { name: "Step 2" }));
    expect(within(panel).getByRole("button", { name: "Step 2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByText("POST https://auth.example.com/token HTTP/1.1")).toBeInTheDocument();
    expect(within(panel).getByText("HTTP/1.1 401 Unauthorized")).toHaveClass("wire__bad");
    const raw = within(panel).getByLabelText("Example token");
    const [h, p, sig] = [".wire__h", ".wire__p", ".wire__s"].map((q) => raw.querySelector(q).textContent);
    expect(JSON.parse(atob(h.replace(/-/g, "+").replace(/_/g, "/")))).toEqual({ alg: "RS256" });
    expect(JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")))).toEqual({ aud: "https://billing.example.com", act: { sub: "agent" } });
    expect(sig).toBe("sig-not-real");
    const row = within(panel).getByText("Who it is for.").closest("tr");
    expect(row).toHaveClass("wire__focus");
    expect(within(panel).getByText("Who is acting.").closest("tr")).not.toHaveClass("wire__focus");
    expect(within(panel).getByText('{"sub":"agent"}')).toBeInTheDocument();
    expect(within(panel).getByText("The service a token is for.")).toBeInTheDocument();
  });
  it("spec links are safe: http(s) opens in a new tab, javascript: is not a link", async () => {
    mockApi({ hub: withWire() });
    await open("/cards");
    const panel = document.querySelector("#card-alpha\\.try details.wire");
    const a = within(panel).getByRole("link", { name: "RFC 8693" });
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(panel).queryByRole("link", { name: "Bad" })).toBeNull();
  });
});

describe("untrusted pack text", () => {
  const X = '<img src=x onerror=alert(1)>';
  it("never becomes markup on any page", async () => {
    const hub = structuredClone(HUB);
    hub.packs[0].title = "<script>alert(1)</script>";
    hub.glossary[0].term = X; hub.glossary[0].definitions[0].term = X; hub.glossary[0].definitions[0].definition = `<script>alert("xss")</script> &lt;b&gt;`;
    hub.cards[0].label = "<b onmouseover=1>Try</b>"; hub.cards[0].description = X;
    hub.sources[0].title = X; hub.sources[0].use = "<iframe src=//evil></iframe>";
    hub.stories[0].say = X;
    const search = structuredClone(SEARCH);
    search.results[0].title = X; search.results[0].titleMatches = [{ start: 0, end: 4 }]; search.results[0].snippet = { text: X, matches: [{ start: 1, end: 4 }], truncatedStart: false, truncatedEnd: false };
    const packs = structuredClone(PACKS);
    packs.packs[0].problems = [X]; packs.packs[0].status = "invalid";
    mockApi({ hub, packs, search });
    for (const url of ["/", "/glossary", "/glossary/alpha.jti", "/glossary/alpha.dpop", "/sources", "/cards", "/search?q=x", "/packs"]) {
      await open(url);
      await waitFor(() => expect(document.querySelector("main").textContent.length).toBeGreaterThan(20));
      expect(document.querySelector("main img, main script, main iframe, main b, main [onerror], main [onmouseover]")).toBeNull();
      cleanup();
    }
    await open("/cards");
    expect(document.querySelector("main").textContent).toContain("<b onmouseover=1>Try</b>"); // shown as text
  });
  it("the app source never uses innerHTML or dangerouslySetInnerHTML", async () => {
    const files = import.meta.glob("../*.jsx", { query: "?raw", import: "default", eager: true });
    for (const [name, src] of Object.entries(files)) expect(src, name).not.toMatch(/innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML/);
  });
});

describe("hosted mock", () => {
  it("shows the banner and hides Reload when the server reports mock-only", async () => {
    mockMode = true;
    mockApi();
    await open("/packs");
    expect(await screen.findByText("Hosted, simulated mock: sample data only, nothing leaves this server")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reload packs/i })).toBeNull();
  });
  it("shows neither when the server is in normal mode", async () => {
    mockApi();
    await open("/packs");
    expect(screen.queryByText(/Hosted mock/)).toBeNull();
    expect(screen.getByRole("button", { name: /reload packs/i })).toBeInTheDocument();
  });
  it("renders localhost demo links as text with a note, and keeps other links, under mock-only", async () => {
    mockMode = true;
    mockApi();
    await open("/");
    expect((await screen.findAllByText("(local demo only)")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Open the demo" })).toBeNull();
    expect(screen.getByText("Open the demo")).toBeInTheDocument();
  });
  it("keeps localhost demo links clickable in normal mode", async () => {
    mockApi();
    await open("/");
    expect(screen.getAllByRole("link", { name: "Open the demo" })[0]).toHaveAttribute("href", "http://localhost:4999");
    expect(screen.queryByText("(local demo only)")).toBeNull();
  });
});
