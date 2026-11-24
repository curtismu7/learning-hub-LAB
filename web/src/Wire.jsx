// "On the wire": example HTTP messages and decoded tokens for a card. Pack text is only ever rendered as React text nodes.
// The token's raw header.payload.signature is built here from the decoded claims, so packs never carry a token-shaped string.
import { useState } from "react";
import { ExtLink } from "./router";

const b64url = (v) => {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const asObject = (rows) => Object.fromEntries(rows.map((r) => [r.name, r.value]));
const show = (v) => (typeof v === "string" ? v : JSON.stringify(v));

function Message({ title, msg }) {
  if (!msg) return <div className="wire__msg"><h5>{title}</h5><p className="muted">None in this step.</p></div>;
  const status = /^HTTP\/\S+ (\d)/.exec(msg.line);
  return (
    <div className="wire__msg">
      <h5>{title}</h5>
      <pre><span className={status ? (status[1] === "2" ? "wire__ok" : "wire__bad") : "wire__verb"}>{msg.line}</span>{"\n"}{(msg.headers || []).join("\n")}{msg.body ? `\n\n${msg.body}` : ""}</pre>
    </div>
  );
}

function Token({ token }) {
  return (
    <div className="wire__token">
      <h5>Token: {token.label}</h5>
      <p className="muted">A JWT is three parts joined by dots: <span className="wire__h">header</span>, <span className="wire__p">payload</span> and <span className="wire__s">signature</span>.</p>
      <pre className="wire__raw" aria-label="Example token">
        <span className="wire__h">{b64url(asObject(token.header))}</span>.<span className="wire__p">{b64url(asObject(token.claims))}</span>.<span className="wire__s">{token.signature}</span>
      </pre>
      <div className="tablewrap">
        <table>
          <caption className="sr">Decoded token</caption>
          <thead><tr><th scope="col">Part</th><th scope="col">Value</th><th scope="col">What this means</th></tr></thead>
          <tbody>
            {token.header.map((r) => <tr key={`h-${r.name}`}><td>header.{r.name}</td><td>{show(r.value)}</td><td>{r.note}</td></tr>)}
            {token.claims.map((r) => <tr key={`p-${r.name}`} className={r.focus ? "wire__focus" : undefined}><td>{r.name}</td><td>{show(r.value)}</td><td>{r.note}</td></tr>)}
            <tr><td>signature</td><td>{token.signature}</td><td>Proof the header and payload were not changed. Here it is a placeholder, not a real signature.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WirePanel({ wire }) {
  const [i, setI] = useState(0);
  const s = wire.steps[i];
  return (
    <details className="wire">
      <summary>On the wire: see the actual messages</summary>
      <p><span className="badge ok">Example</span> {wire.intro}</p>
      <div className="wire__steps" role="group" aria-label="Steps">
        {wire.steps.map((st, k) => <button key={st.title} type="button" className="wire__step" aria-pressed={k === i} onClick={() => setI(k)}>Step {k + 1}</button>)}
      </div>
      <h4>{s.title}</h4>
      {s.between && <p className="muted">{s.between}</p>}
      {s.quiet && <p className="wire__quiet"><strong>No network call here.</strong> {s.quiet}</p>}
      {(s.request || s.response) && (
        <div className="wire__cols"><Message title="Request" msg={s.request} /><Message title="Response" msg={s.response} /></div>
      )}
      {s.token && <Token token={s.token} />}
      <p className="wire__notice"><strong>What to notice.</strong> {s.notice}</p>
      {s.jargon?.length > 0 && (
        <details>
          <summary>Words used in this step</summary>
          <dl>{s.jargon.map((j) => <div key={j.term}><dt>{j.term}</dt><dd>{j.meaning}</dd></div>)}</dl>
        </details>
      )}
      {wire.links?.length > 0 && <p>{wire.links.map((l, k) => <span key={l.url}>{k > 0 && " · "}<ExtLink href={l.url}>{l.label}</ExtLink></span>)}</p>}
    </details>
  );
}
