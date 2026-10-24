import { Fragment, type ReactNode } from 'react';

/**
 * A deliberately small Markdown renderer for analyst answers: headings, paragraphs, bullet and
 * numbered lists, pipe tables, fenced code, **bold**, *italic* and `code`. It builds React
 * elements only (no dangerouslySetInnerHTML), so model output can never inject markup, and it
 * tolerates half-streamed input (an unclosed ** just renders as text until it closes).
 */
export function Markdown({ text }: { text: string }) {
  return <div className="agent-md space-y-2.5 text-[13.5px] leading-relaxed text-ink">{parseBlocks(text)}</div>;
}

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'code'; text: string };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function toBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(t);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const bullet = /^[-*•]\s+/;
    const numbered = /^\d+[.)]\s+/;
    if (bullet.test(t) || numbered.test(t)) {
      const kind = bullet.test(t) ? 'ul' : 'ol';
      const re = kind === 'ul' ? bullet : numbered;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(re, ''));
        i++;
        // Continuation lines indented under the item belong to it.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i].trim())) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      blocks.push({ kind, items });
      continue;
    }
    const para: string[] = [t];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|[-*•]\s|\d+[.)]\s|\||```)/.test(lines[i].trim())
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push({ kind: 'p', text: para.join(' ') });
  }
  return blocks;
}

function parseBlocks(src: string): ReactNode[] {
  return toBlocks(src).map((b, i) => {
    switch (b.kind) {
      case 'h':
        return (
          <h4 key={i} className={`font-semibold text-ink ${b.level <= 2 ? 'text-[14.5px]' : 'text-[13.5px]'} pt-1`}>
            {inline(b.text)}
          </h4>
        );
      case 'p':
        return <p key={i}>{inline(b.text)}</p>;
      case 'ul':
        return (
          <ul key={i} className="ml-4 list-disc space-y-1 marker:text-muted">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i} className="ml-4 list-decimal space-y-1 marker:text-muted">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ol>
        );
      case 'table':
        return (
          <div key={i} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[12.5px] tabular-nums">
              <thead className="bg-sunken text-left text-ink2">
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j} className="px-2.5 py-1.5 font-medium">
                      {inline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-t border-line">
                    {r.map((c, k) => (
                      <td key={k} className="px-2.5 py-1.5">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'code':
        return (
          <pre key={i} className="overflow-x-auto rounded-lg bg-sunken p-3 font-mono text-[12px] text-ink2">
            {b.text}
          </pre>
        );
    }
  });
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function inline(text: string): ReactNode {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    if (/^([*_]).+\1$/.test(part) && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
