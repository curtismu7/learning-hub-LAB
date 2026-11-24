// Renders server text with <mark> over the match offsets. Text is always a React text node, never HTML.
export default function Highlight({ text, matches = [] }) {
  const out = [];
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < at || m.end > text.length) continue;
    if (m.start > at) out.push(text.slice(at, m.start));
    out.push(<mark key={m.start}>{text.slice(m.start, m.end)}</mark>);
    at = m.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}
