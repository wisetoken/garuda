import type { ImageMetadata } from 'astro';

/**
 * The shape of all content. src/lib/content.ts builds it from Sanity or from src/data/demo.json,
 * so pages never care where it came from. Field names follow demo.json one to one; in demo.json an
 * image is the file name of an image in src/assets/img (without .jpg).
 */

/** An image from either source. Pages pass it to <Photo>, which knows how to render both. */
export interface Photo {
  alt: string;
  /** Local build: the file in src/assets/img, imported by Astro. */
  local?: ImageMetadata;
  /** Sanity build: the image field as stored (asset reference, crop and hotspot). */
  sanity?: { asset: { _ref: string }; crop?: unknown; hotspot?: unknown };
}

export interface Link {
  label: string;
  href: string;
}
export interface Seo {
  title: string;
  description: string;
}
/** A big value and a short line under it ("x3" / "more enquiries in the first six months"). */
export interface Fact {
  value: string;
  label: string;
}
/** A title and one sentence: deliverables, values, plan extras. */
export interface Item {
  title: string;
  text: string;
}
export interface Faq {
  q: string;
  a: string;
}

export interface Site {
  name: string;
  legalName: string;
  tagline: string;
  /** The four-line text next to the logo on the home page header. */
  descriptor: string;
  description: string;
  url: string;
  email: string;
  phone: string;
  city: string;
  address: { street: string; city: string; postal: string; country: string; countryName: string };
  hours: string;
  founded: number;
  teamSize: number;
  nav: Link[];
  cta: Link;
  social: Link[];
  footerPages: Link[];
  copyright: string;
  legal: Link[];
  formEndpoint: string;
  newsletterEndpoint: string;
}

export interface Menu {
  caseLabel: string;
  /** Case slug shown in the open menu as the latest case. */
  case: string;
  /** Preview image per menu link, by href. */
  previews: Record<string, Photo>;
}

export interface Buy {
  kicker: string;
  title: string;
  text: string;
  price: string;
  cta: string;
}

export interface Blocks {
  contact: { label: string; title: string[]; button: string };
  newsletter: { label: string; title: string; placeholder: string; button: string; field: string; thanks: string };
}

export interface Offer {
  /** Which render it is: drives the hover (the coin flips, the knot turns). */
  kind: 'coin' | 'knot';
  label: string;
  title: string;
  href: string;
  image: Photo;
}

export interface Slide {
  text: string;
  href: string;
  image: Photo;
  /** A taller crop for phones, when the desktop frame is too wide to read. */
  mobile?: Photo;
}

export interface Home {
  seo: Seo;
  slides: Slide[];
  statement: string[];
  aboutLabel: string;
  aboutLead: string;
  workTitle: string;
  workLink: Link;
  /** Case slugs. */
  work: string[];
}

export type IconName = 'spark' | 'circles' | 'tag' | 'layers';

export interface Service {
  slug: string;
  n: string;
  title: string;
  icon: IconName;
  short: string;
  deliverables: string[];
  more: string;
  label: string;
  casesTitle: string;
  lead: string;
  price: string;
  minPrice: number;
  timeline: string;
  team: string;
  gets: Item[];
  phases: { name: string; weeks: number }[];
  /** Case slugs. */
  cases: string[];
  faq: Faq[];
  seo: Seo;
}

export interface Category {
  slug: string;
  label: string;
}

export interface Case {
  slug: string;
  title: string;
  /** The line under the name on cards: "Identity, stationery". */
  cat: string;
  year: number;
  /** Category slugs for the /work filter. */
  filters: string[];
  /** Service slugs. */
  services: string[];
  client: string;
  team: string;
  lead: string;
  /** Card image (grid, home, related projects); also the first of the image pair. */
  cover: Photo;
  /** The wide image under the facts. */
  hero: Photo;
  /** The second image of the pair. */
  detail: Photo;
  task: string;
  solution: string;
  results: Fact[];
  quote: { text: string; author: string };
  seo: Seo;
}

export interface Person {
  slug: string;
  name: string;
  role: string;
  since: string;
}

export interface Plan {
  slug: string;
  name: string;
  monthly: number;
  popular?: boolean;
  desc: string;
  features: string[];
  cta: Link;
}

export interface Plans {
  monthly: string;
  quarterly: string;
  /** Percent off when billed quarterly. */
  discount: number;
  popular: string;
  per: string;
  /** ISO currency code: EUR, USD, GBP... */
  currency: string;
  items: Plan[];
}

export interface PageHeadText {
  seo: Seo;
  title: string;
  count?: string;
  label: string;
  lead: string;
}

export interface About extends PageHeadText {
  image: Photo;
  thinkLabel: string;
  think: string;
  valuesTitle: string;
  values: Item[];
  peopleTitle: string;
  rolesLink: Link;
  clientsTitle: string;
  clients: { name: string; weight: number; tracking: number }[];
  awardsTitle: string;
  awards: { year: string; title: string; project: string }[];
}

export interface ServicesPage extends PageHeadText {
  stepsTitle: string;
  steps: { title: string; text: string; time: string }[];
  offersTitle: string;
  faqTitle: string;
  faq: Faq[];
}

export interface WorkPage extends PageHeadText {
  all: string;
  sort: string;
  shown: string;
  more: string;
  perPage: number;
}

export interface PricingPage extends PageHeadText {
  includesTitle: string;
  includes: Item[];
  faqTitle: string;
  faq: Faq[];
}

export interface JournalPage extends PageHeadText {
  all: string;
  categories: string[];
  read: string;
  more: string;
  perPage: number;
  readNext: string;
  allNotes: Link;
}

/** Article body after normalising: HTML strings are already escaped. */
export type BodyBlock =
  | { type: 'p' | 'h2'; html: string }
  | { type: 'quote'; html: string; cite: string }
  | { type: 'ol' | 'ul'; items: string[] };

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO date, e.g. 2026-10-12. */
  date: string;
  /** Person slug. */
  author: string;
  category: string;
  cover: Photo;
  body: BodyBlock[];
}

export interface Contact extends PageHeadText {
  formTitle: string;
  fields: { name: string; company: string; email: string; phone: string; message: string };
  placeholders: { name: string; company: string; email: string; phone: string; message: string };
  needsLabel: string;
  needs: string[];
  budgetLabel: string;
  budgets: string[];
  consent: string;
  consentLink: string;
  submit: string;
  writeLabel: string;
  callLabel: string;
  visitLabel: string;
  hoursLabel: string;
  image: Photo;
}

export interface SimplePage {
  seo: Seo;
  title: string;
  label?: string;
  lead: string;
  links: Link[];
}

export interface Legal {
  slug: string;
  /** The giant caps title: "PRIVACY". */
  title: string;
  /** The plain name for links and breadcrumbs: "Privacy policy". */
  name: string;
  seo: Seo;
  /** ISO date. */
  updated: string;
  lead: string;
  sections: { h: string; p: string }[];
}

/** Small interface strings ("Next project", "menu"...). */
export type Ui = Record<
  | 'skip' | 'menu' | 'close' | 'home' | 'openMenu' | 'closeMenu' | 'viewCase' | 'readNote' | 'cursorView' | 'nextSlide' | 'slides' | 'slide'
  | 'nextProject' | 'client' | 'services' | 'year' | 'team' | 'task' | 'solution' | 'results' | 'price' | 'timeline' | 'teamSize'
  | 'getsTitle' | 'timelineTitle' | 'week' | 'weeks' | 'book' | 'writtenBy' | 'share' | 'copyLink' | 'copied' | 'minRead' | 'onThisPage'
  | 'updated' | 'since' | 'filter' | 'menuLabel' | 'footerPages' | 'footerSocial' | 'footerContacts' | 'backHome' | 'formSending' | 'formError'
  | 'caseStudy' | 'to' | 'shareLinkedIn' | 'shareEmail',
  string
>;

export interface Content {
  site: Site;
  menu: Menu;
  buy: Buy;
  blocks: Blocks;
  offers: Offer[];
  home: Home;
  stats: Fact[];
  services: Service[];
  categories: Category[];
  cases: Case[];
  people: Person[];
  plans: Plans;
  about: About;
  servicesPage: ServicesPage;
  workPage: WorkPage;
  pricingPage: PricingPage;
  journal: JournalPage;
  posts: Post[];
  contact: Contact;
  thanks: SimplePage;
  notFound: SimplePage;
  legal: Legal[];
  ui: Ui;
}
