import { useEffect } from 'react';
import { SITE } from '../../shared/site';

/** Keeps the tab title and description right during in-app navigation (the Worker sets them on first load). */
export function useSeo(title: string | undefined, description?: string) {
  useEffect(() => {
    if (title === undefined) return;
    document.title = title === SITE.name ? `${SITE.name} — ${SITE.tagline}` : `${title} · ${SITE.name}`;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
