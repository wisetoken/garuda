/**
 * Builds full-bleed homepage hero slides from the original screenshots.
 * Desktop matches the hero frame (1416/580). Phones match 338/470.
 * Each file is a crop of the source, not a downscale, so the slide stays sharp.
 *
 *   node scripts/compose-hero-slides.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = resolve(root, 'marketing/src/assets/screenshots');
const outDir = resolve(root, 'marketing/src/assets/slides');

const DESKTOP = { width: 1416, height: 580 };
const PHONE = { width: 338, height: 470 };

const slides = [
    { name: 'purchase.png', file: 'review-purchase.jpg', frame: DESKTOP },
    { name: 'market.png', file: 'stake-market.jpg', frame: DESKTOP },
    { name: 'positions.png', file: 'your-stakes.jpg', frame: DESKTOP },
    // Phone frames are portrait, so each crop stays on the part you can still read.
    { name: 'purchase-mobile.png', file: 'review-purchase.jpg', frame: PHONE, focus: { x: 760 } },
    { name: 'market-mobile.png', file: 'stake-market.jpg', frame: PHONE, focus: { x: 805 } },
    { name: 'positions-mobile.png', file: 'your-stakes.jpg', frame: PHONE, focus: { x: 720 } },
];

function cropBox(srcW, srcH, frame, focus) {
    const target = frame.width / frame.height;
    let width;
    let height;
    if (srcW / srcH > target) {
        height = srcH;
        width = Math.min(srcW, Math.round(srcH * target));
    } else {
        width = srcW;
        height = Math.min(srcH, Math.round(srcW / target));
    }
    const fx = focus?.x ?? srcW / 2;
    const fy = focus?.y ?? srcH / 2;
    const left = Math.max(0, Math.min(srcW - width, Math.round(fx - width / 2)));
    const top = Math.max(0, Math.min(srcH - height, Math.round(fy - height / 2)));
    return { left, top, width, height };
}

mkdirSync(outDir, { recursive: true });
for (const slide of slides) {
    const source = resolve(shots, slide.file);
    const meta = await sharp(source).metadata();
    const box = cropBox(meta.width, meta.height, slide.frame, slide.focus);
    await sharp(source).extract(box).png({ compressionLevel: 9 }).toFile(resolve(outDir, slide.name));
    console.log(`${slide.name} ${box.width}x${box.height} at ${box.left},${box.top}`);
}
