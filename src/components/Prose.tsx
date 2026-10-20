import { useMemo } from 'react';
import { renderMarkdown } from '../../shared/markdown';

/** Markdown from the admin panel. renderMarkdown escapes everything, so the HTML is safe to insert. */
export function Prose({ source, small }: { source: string; small?: boolean }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className={small ? 'prose small' : 'prose'} dangerouslySetInnerHTML={{ __html: html }} />;
}
