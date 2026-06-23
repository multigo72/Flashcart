// Terminal entry point. Examples:
//   node src/cli.js                       # defaults: 98177, paint roller + painter's tape
//   node src/cli.js --zip 98177 --headless --items "paint roller, painter's tape"
//   node src/cli.js -i "9in roller" -i "blue tape"

import { addItemsToCart } from './cart.js';
import { DEFAULT_ZIP, DEFAULT_ITEMS, DEFAULT_SITE } from './config.js';

function parseArgs(argv) {
  const out = { zip: DEFAULT_ZIP, site: DEFAULT_SITE, headless: false, items: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--zip' || a === '-z') out.zip = argv[++i];
    else if (a === '--site' || a === '-s') out.site = argv[++i];
    else if (a === '--headless') out.headless = true;
    else if (a === '--items') out.items.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--item' || a === '-i') out.items.push(argv[++i]);
  }
  if (out.items.length === 0) out.items = DEFAULT_ITEMS;
  return out;
}

const opts = parseArgs(process.argv.slice(2));

const icon = { info: '·', success: '✓', warn: '!', error: '✗' };
const onProgress = ({ message, level = 'info' }) =>
  console.log(`${icon[level] || '·'} ${message}`);

console.log(`FlashCart → site=${opts.site} zip=${opts.zip} headless=${opts.headless}`);
console.log(`Items: ${opts.items.map((i) => `"${i}"`).join(', ')}\n`);

addItemsToCart({ ...opts, onProgress })
  .then(({ results }) => {
    console.log('\nSummary:');
    for (const r of results) {
      console.log(`  ${r.added ? '✓' : '✗'} ${r.term}${r.via ? `  (${r.via})` : ''}${r.error ? `  — ${r.error}` : ''}`);
    }
    // Leave the process up briefly in headed mode so the window stays usable.
    if (!opts.headless) {
      console.log('\nBrowser is open for manual review/checkout. Press Ctrl+C to quit.');
    } else {
      process.exit(0);
    }
  })
  .catch((e) => {
    console.error('\nFailed:', e.message);
    process.exit(1);
  });
