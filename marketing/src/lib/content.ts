import type { ImageMetadata } from 'astro';
import data from '../data/content.json';
import type { Content, Photo } from './types';
import stake from '../assets/hero-stake.svg';
import market from '../assets/hero-market.svg';
import purchase from '../assets/slides/purchase.png';
import purchaseMobile from '../assets/slides/purchase-mobile.png';
import marketSlide from '../assets/slides/market.png';
import marketMobile from '../assets/slides/market-mobile.png';
import positions from '../assets/slides/positions.png';
import positionsMobile from '../assets/slides/positions-mobile.png';
const images: Record<string, ImageMetadata> = {
  'hero-stake': stake,
  'hero-market': market,
  'slide-purchase': purchase,
  'slide-purchase-mobile': purchaseMobile,
  'slide-market': marketSlide,
  'slide-market-mobile': marketMobile,
  'slide-positions': positions,
  'slide-positions-mobile': positionsMobile,
};
const alts: Record<string, string> = {
  'hero-stake': 'WiseOne stake ownership, built around the WISE owl',
  'hero-market': 'Garuda marketplace, new possibilities for an existing stake',
};
const photo = (key: string, alt?: string): Photo => ({ local: images[key], alt: alt || alts[key] || '' });
const content = {
  ...data,
  home: {
    ...data.home,
    slides: data.home.slides.map(s => ({
      text: s.text,
      href: s.href,
      image: photo(s.image, s.alt),
      mobile: s.mobile ? photo(s.mobile, s.alt) : undefined,
    })),
  },
  menu: { ...data.menu, previews: Object.fromEntries(Object.entries(data.menu.previews).map(([href, key]) => [href, photo(key)])) },
} as unknown as Content;
export const getContent = async () => content;
