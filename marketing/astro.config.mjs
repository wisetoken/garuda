import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://garuda.wise.one',
  outDir: '../.generated/homepage',
  // Only local, repository-owned SVG artwork is rasterized into responsive images.
  image: { dangerouslyProcessSVG: true },
  build: { format: 'file', inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
