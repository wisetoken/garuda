import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import type { Plugin, Connect } from 'vite';
import { resolveAppRoute } from '../src/navigation';

export function appRoutes(allowDeploy = false): Connect.NextHandleFunction {
  return (req, _res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (resolveAppRoute(url.pathname, url.search, url.hash, allowDeploy))
      req.url = `/garuda/index.html${url.search}`;
    next();
  };
}

/** Share the static Astro homepage with the existing Vite dev server and production output. */
export function homepagePlugin(): Plugin {
  let homepage = '';
  let output = '';
  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  };
  return {
    name: 'garuda-homepage',
    configResolved(config) {
      homepage = resolve(config.root, '.generated/homepage');
      output = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(appRoutes(true));
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (pathname !== '/' && pathname !== '/index.html' && !pathname.startsWith('/_astro/')) return next();
        const file = resolve(homepage, pathname === '/' ? 'index.html' : `.${pathname}`);
        if (!file.startsWith(homepage + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', contentTypes[extname(file)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(appRoutes());
    },
    writeBundle() {
      if (!existsSync(resolve(homepage, 'index.html'))) throw new Error('Run npm run build:homepage before building the app.');
      cpSync(homepage, output, { recursive: true });
    },
  };
}
