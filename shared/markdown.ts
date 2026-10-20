// A small, safe Markdown subset for course descriptions and lesson notes.
// Used by the React app and by the Worker (which renders it into the HTML that search engines read).
//   ## Heading   ### Heading   - bullet   1. numbered   > quote   **bold**   *italic*   [text](https://… | mailto:… | /path)   bare https:// links
// Everything is escaped first, so admin input can never inject HTML.

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(text: string) {
  const links: string[] = [];
  const stash = (html: string) => `\u0000${links.push(html) - 1}\u0000`;
  let out = escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/(?!\/)[^\s)]*)\)/g, (_, label: string, href: string) =>
      stash(`<a href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`))
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, (href) => stash(`<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`));
  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => links[Number(index)]!);
}

export function renderMarkdown(source: string) {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
    if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) { flush(); html.push(`<h${heading[1]!.length + 1}>${inline(heading[2]!)}</h${heading[1]!.length + 1}>`); }
    else if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (paragraph.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else if (line.startsWith('>')) { flush(); html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); }
    else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return html.join('\n');
}

/** Plain text for meta descriptions. */
export function markdownToText(source: string, max = 160) {
  const text = source
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*#>`]/g, '')
    .replace(/^\s*[-\d.)]+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}

export { escapeHtml };
