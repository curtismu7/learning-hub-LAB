# Security notes

The hub is a local, read-only tool. It is not meant to be hosted for others.

- **Inert text.** Pack text is parsed as JSON and rendered only as text nodes. There is no `dangerouslySetInnerHTML`, no
  Markdown or HTML rendering. Search snippets carry match offsets, never markup. Links are drawn only if they are http(s) (or
  a route inside the hub); a `javascript:` or `data:` link makes a pack invalid and is shown as plain text if it ever got through.
  Outbound links open with `rel="noopener noreferrer"`.
- **Loopback.** The server binds `127.0.0.1` unless `HUB_BIND` is set. While bound to loopback it answers only loopback `Host`
  names (a DNS-rebinding guard). Setting `HUB_BIND=0.0.0.0` means anyone on the network can read the hub; it has no accounts.
  Pack sources must be absolute local `.json` paths, or `.json` paths relative to the repo root (no `..`, no shell characters; a
  repo-relative path must resolve inside the repo; symlinks are resolved and the target must also be `.json`; anything that is not a
  regular file, such as a FIFO, socket or device, is refused before it is opened, and a read times out after 5 seconds) or `http(s)` URLs on loopback, without credentials, with no redirects followed.
- **Size caps.** A pack is refused over 5 MiB (the file size and, for a URL, the streamed bytes), a string over 8000
  characters, a list over 5000 items. A fetch times out after 5 seconds. Search queries are capped at 200 characters and 16 tokens.
- **No secrets, no tokens.** A pack string shaped like a JWT is refused. Packs must not carry tenant ids, client ids or
  private hostnames; the Privilege pack and the shipped registry contain none. A gitleaks pre-commit hook guards commits.
- **Read-only API.** The only write-like call is `POST /api/reload`, rate limited to 5 per minute and refused when its `Origin`
  is not the hub's own. Responses carry a strict `Content-Security-Policy` (`default-src 'self'`), `nosniff` and `no-referrer`.
- **Shelf registry.** `HUB_SHELF_URL` is read as a file (absolute `.json` path, at most 1 MiB). Only its `url` values are used, and only if
  they are http(s) without credentials; a bad file or entry is reported on the Packs page and ignored.
- **Not covered.** The hub does not verify that a pack's content is true, only that it is well formed. A pack is trusted as
  much as the repo it came from.
