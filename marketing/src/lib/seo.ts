import type { Content } from './types';
type Ld = Record<string, unknown>;
const CTX = 'https://schema.org';
const abs = (site: URL, path: string) => new URL(path, site).href;
export const studioId = (site: URL) => abs(site, '/#organization');
export const websiteId = (site: URL) => abs(site, '/#website');
export function studioLd(c: Content, site: URL): Ld {
  return { '@context': CTX, '@type': 'Organization', '@id': studioId(site), name: 'WiseOne', description: c.site.description, url: abs(site, '/'), logo: abs(site, '/wiseone-logo.png') };
}

export function websiteLd(c: Content, site: URL): Ld {
  return {
    '@context': CTX,
    '@type': 'WebSite',
    '@id': websiteId(site),
    name: c.site.name,
    url: abs(site, '/'),
    description: c.site.description,
    inLanguage: 'en',
    publisher: { '@id': studioId(site) },
  };
}

/** WebPage subtypes: AboutPage, ContactPage, CollectionPage, WebPage. */
export function pageLd(type: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage', site: URL, path: string, name: string, description: string, extra: Ld = {}): Ld {
  return {
    '@context': CTX,
    '@type': type,
    '@id': abs(site, path),
    url: abs(site, path),
    name,
    description,
    inLanguage: 'en',
    isPartOf: { '@id': websiteId(site) },
    about: { '@id': studioId(site) },
    ...extra,
  };
}

export function breadcrumbLd(site: URL, items: { name: string; path: string }[]): Ld {
  return {
    '@context': CTX,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(site, it.path) })),
  };
}
