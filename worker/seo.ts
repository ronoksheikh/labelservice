// Server-rendered <head> tags and crawlable content for public pages.
// The React app is a single-page app, so the Worker takes the built index.html and fills in the title,
// description, Open Graph/Twitter tags (what Facebook shows when a link is shared), canonical URL and
// JSON-LD, plus a plain HTML version of the page inside #root that React replaces when it starts.
// The data the page needs is inlined as window.__BOOT__ so the first render doesn't wait for the API.

import { escapeHtml as esc, markdownToText, renderMarkdown } from '../shared/markdown';
import { formatDuration, SITE, taka } from '../shared/site';
import type { CourseDetail, CourseSummary } from '../shared/types';

export interface Page {
  path: string;
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'product' | 'article';
  jsonLd?: object[];
  body: string;
  boot?: unknown;
  status?: number;
  noindex?: boolean;
}

const absolute = (base: string, url: string) => (url.startsWith('/') ? `${base}${url}` : url);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

export async function renderPage(env: Env, request: Request, page: Page) {
  const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: { Accept: 'text/html' } }));
  const base = env.SITE_URL.replace(/\/$/, '');
  const canonical = `${base}${page.path}`;
  const image = absolute(base, page.image || '/og.png');
  const title = page.title === SITE.name ? `${SITE.name} — ${SITE.tagline}` : `${page.title} · ${SITE.name}`;
  const tags = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    page.noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<meta property="og:site_name" content="${SITE.name}">`,
    `<meta property="og:locale" content="${SITE.locale}">`,
    `<meta property="og:type" content="${page.type ?? 'website'}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:alt" content="${esc(page.title)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    ...(page.jsonLd ?? []).map((data) => `<script type="application/ld+json">${json(data)}</script>`),
  ].join('\n    ');

  const html = new HTMLRewriter()
    .on('title', { element: (el) => { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element: (el) => { el.setAttribute('content', page.description); } })
    .on('head', { element: (el) => { el.append(`\n    ${tags}\n  `, { html: true }); } })
    .on('div#root', {
      element: (el) => {
        el.setInnerContent(`<div class="prerender">${page.body}</div>`, { html: true });
        if (page.boot !== undefined) el.after(`<script>window.__BOOT__=${json({ path: page.path, data: page.boot })}</script>`, { html: true });
      },
    })
    .transform(shell);
  return new Response(html.body, {
    status: page.status ?? 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}

/* ---------- Structured data ---------- */

export const organization = (base: string) => ({
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  '@id': `${base}/#organization`,
  name: SITE.name,
  url: base,
  logo: `${base}/logo-mark.png`,
  description: SITE.description,
  founder: SITE.founders.map((name) => ({ '@type': 'Person', name })),
  areaServed: 'BD',
});

export const website = (base: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${base}/#website`,
  name: SITE.name,
  url: base,
  publisher: { '@id': `${base}/#organization` },
  inLanguage: ['en', 'bn'],
});

export const courseList = (base: string, courses: CourseSummary[]) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: courses.map((course, index) => ({
    '@type': 'ListItem', position: index + 1, url: `${base}/courses/${course.slug}`, name: course.title,
  })),
});

export function courseSchema(base: string, course: CourseDetail) {
  const url = `${base}/courses/${course.slug}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Course',
      '@id': url,
      name: course.title,
      description: markdownToText(course.description || course.subtitle, 500),
      url,
      image: course.imageUrl ? absolute(base, course.imageUrl) : undefined,
      provider: { '@type': 'Organization', name: SITE.name, sameAs: base },
      offers: {
        '@type': 'Offer', category: course.price ? 'Paid' : 'Free', price: course.price, priceCurrency: 'BDT',
        availability: 'https://schema.org/InStock', url,
      },
      hasCourseInstance: {
        '@type': 'CourseInstance', courseMode: 'Online',
        ...(course.totalMinutes ? { courseWorkload: `PT${Math.floor(course.totalMinutes / 60)}H${course.totalMinutes % 60}M` } : {}),
      },
      syllabusSections: course.lessons.slice(0, 50).map((lesson) => ({ '@type': 'Syllabus', name: lesson.title })),
    },
    breadcrumbs(base, [['Courses', '/#courses'], [course.title, `/courses/${course.slug}`]]),
  ];
}

export const breadcrumbs = (base: string, trail: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [['Home', '/'] as [string, string], ...trail].map(([name, path], index) => ({
    '@type': 'ListItem', position: index + 1, name, item: `${base}${path}`,
  })),
});

/* ---------- Crawlable HTML (replaced by React on load) ---------- */

const nav = `<header><a href="/"><strong>${SITE.name}</strong></a> · <a href="/#courses">Courses</a> · <a href="/about">About</a> · <a href="/my">My courses</a></header>`;
const footer = `<footer><p>${SITE.name} · Made in Bangladesh by ${SITE.founders.join(' and ')}.</p>
  <p><a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/refunds">Refunds</a></p></footer>`;

export const shellHtml = (main: string) => `${nav}<main>${main}</main>${footer}`;

export function homeHtml(courses: CourseSummary[]) {
  return shellHtml(`<h1>${esc(SITE.tagline)}</h1><p>${esc(SITE.description)}</p>
    <section id="courses"><h2>Courses</h2><ul>${courses.map((course) => `<li><a href="/courses/${esc(course.slug)}">
      <h3>${esc(course.title)}</h3></a><p>${esc(course.subtitle)}</p><p>${taka(course.price)}</p></li>`).join('')}</ul></section>`);
}

export function courseHtml(course: CourseDetail) {
  return shellHtml(`<article><h1>${esc(course.title)}</h1><p>By ${SITE.name}</p><p><strong>${taka(course.price)}</strong>${
    course.comparePrice ? ` <s>${taka(course.comparePrice)}</s>` : ''}</p>
    ${course.imageUrl ? `<img src="${esc(course.imageUrl)}" alt="${esc(course.title)}" width="1280" height="720">` : ''}
    ${renderMarkdown(course.description)}
    ${course.lessons.length ? `<h2>What's inside</h2><p>${course.lessons.length} lessons · ${formatDuration(course.totalMinutes)}</p>
      <ol>${course.lessons.map((lesson) => `<li>${esc(lesson.title)}</li>`).join('')}</ol>` : ''}
    <p><a href="#checkout">Buy now</a></p></article>`);
}
