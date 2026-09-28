'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
const files = [
  'index.html', 'app.js', 'enhancements.js', 'customer-orders.js', 'stage3.js', 'stage4.js',
  'styles.css', 'stage2.css', 'stage3.css', 'stage4.css',
  'hero-shoe.jpg', 'product-shoes.jpg', 'touba-hero.jpg', 'robots.txt', 'sitemap.xml',
  'services/data-provider.js', 'services/application-services.js', 'services/cart-functions.js', 'services/seo.js',
  'repositories/mock-repository.js', 'repositories/bootstrap.js', 'mock/seed-data.js', 'admin-product-ai.js'
];
fs.rmSync(output, { recursive:true, force:true });
for (const relative of files) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Missing Vercel static asset: ${relative}`);
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.copyFileSync(source, target);
}
console.log(`Vercel static output ready: ${files.length} assets in public/`);
