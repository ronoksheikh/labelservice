import { api } from './api';
import { trafficSource } from '../shared/source';

const read = (storage: Storage, key: string) => { try { return storage.getItem(key); } catch { return null; } };
const write = (storage: Storage, key: string, value: string) => { try { storage.setItem(key, value); } catch { /* private mode */ } };

export function visitorId() {
  let id = read(localStorage, 'tb_vid');
  if (!id) { id = crypto.randomUUID(); write(localStorage, 'tb_vid', id); }
  return id;
}

/** First-touch source for this browsing session (facebook, google, direct, …). */
export function visitSource() {
  let source = read(sessionStorage, 'tb_src');
  if (!source) {
    source = trafficSource(location.href, document.referrer, location.hostname.replace(/^www\./, ''));
    write(sessionStorage, 'tb_src', source);
  }
  return source;
}

let last = '';
export function trackPageview(path: string) {
  if (path === last || path.startsWith('/admin')) return;
  last = path;
  void api('/track', { body: { visitorId: visitorId(), path, source: visitSource() } }).catch(() => undefined);
}
