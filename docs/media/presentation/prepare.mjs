import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assets = new URL('./assets/', import.meta.url);
mkdirSync(assets, { recursive: true });
// Keep the renderer dependency out of the app bundle and preserve its package license.
copyFileSync(require.resolve('gsap/dist/gsap.min.js'), new URL('gsap.min.js', assets));
