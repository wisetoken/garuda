// SPDX-License-Identifier: MIT
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildBackup() {
  const result = await build({ absWorkingDir: root, entryPoints: ['src/backup/main.ts'], bundle: true,
    write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    legalComments: 'inline', charset: 'utf8', metafile: true });
  const forbidden = Object.keys(result.metafile.inputs).filter(file => /node_modules\/(thirdweb|@arkiv-network)|server\//.test(file));
  if (forbidden.length) throw new Error(`Unexpected runtime dependencies: ${forbidden.join(', ')}`);
  const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const hash = createHash('sha256').update(script).digest('base64');
  // The same pinned bootstrap is embedded by the harness in its sandboxed srcdoc.
  // importScripts also obeys script-src-elem in some browsers. Permit blob scripts
  // for the verified worker, but no remote/data scripts, inline handlers or JS eval.
  const iframeBoot = await readFile(new URL(import.meta.resolve('@anon-rpc/browser-harness/iframe-boot.js')), 'utf8');
  const iframeHash = createHash('sha256').update(iframeBoot).digest('base64');
  const scriptHashes = `'sha256-${hash}' 'sha256-${iframeHash}'`;
  const csp = `default-src 'none'; script-src ${scriptHashes} blob: 'wasm-unsafe-eval'; script-src-elem ${scriptHashes} blob:; script-src-attr 'none'; frame-src 'self'; worker-src blob:; style-src 'unsafe-inline'; connect-src https: wss: http://localhost:* http://127.0.0.1:* http://[::1]:*; img-src data:; base-uri 'none'; form-action 'none'`;
  const template = await readFile(resolve(root, 'src/backup/template.html'), 'utf8');
  const html = template.replace('__CSP__', csp).replace('__SCRIPT__', () => script);
  return { html, sha256: createHash('sha256').update(html).digest('hex'), inputs: Object.keys(result.metafile.inputs) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(root, process.argv[2] ?? 'public');
  const result = await buildBackup();
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'garuda-backup.html'), result.html);
  await writeFile(resolve(output, 'garuda-backup.sha256'), `${result.sha256}  garuda-backup.html\n`);
  console.log(`Built self-contained backup (${Buffer.byteLength(result.html)} bytes), SHA-256 ${result.sha256}`);
}
