import type { ImageMetadata } from 'astro';
import data from '../data/content.json';
import type { Content, Photo } from './types';
import stake from '../assets/hero-stake.svg';
import market from '../assets/hero-market.svg';
const images: Record<string, ImageMetadata> = { 'hero-stake': stake, 'hero-market': market };
const photo = (key: string): Photo => ({ local: images[key], alt: key === 'hero-stake' ? 'WiseOne stake ownership, built around the WISE owl' : 'Garuda marketplace, new possibilities for an existing stake' });
const content = {
  ...data,
  home: { ...data.home, slides: data.home.slides.map(s => ({ ...s, image: photo(s.image) })) },
  menu: { ...data.menu, previews: Object.fromEntries(Object.entries(data.menu.previews).map(([href, key]) => [href, photo(key)])) },
} as unknown as Content;
export const getContent = async () => content;
