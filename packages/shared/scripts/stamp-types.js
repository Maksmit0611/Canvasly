/**
 * Node decides CJS vs ESM from the nearest package.json "type". The two build
 * outputs live side by side, so each needs its own marker or one of them is
 * parsed as the wrong module system.
 */
const fs = require('node:fs');
const path = require('node:path');

const write = (dir, type) => {
  const target = path.resolve(__dirname, '..', 'dist', dir);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`);
};

write('cjs', 'commonjs');
write('esm', 'module');
