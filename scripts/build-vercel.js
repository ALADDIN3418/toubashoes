'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
const files = [
  'index.html', 'app.js', 'enhancements.js', 'customer-orders.js', 'stage3.js', 'stage4.js',
  'styles.css', 'stage2.css', 'stage3.css', 'stage4.css', 'storefront-theme.css',
  'hero-shoe.jpg', 'product-shoes.jpg', 'touba-hero.jpg', 'touba-hero-editorial.jpg', 'touba-bag-editorial.jpg', 'touba-logo.png', 'enamad-logo.png', 'fonts/IRANSansWeb.woff2', 'fonts/IRANSansWeb_Light.woff2', 'fonts/IRANSansWeb_Medium.woff2', 'fonts/IRANSansWeb_Bold.woff2', 'fonts/IRANSansWeb_UltraLight.woff2', 'robots.txt', 'sitemap.xml', 'google1473493f12c4eaa6.html', '18887070.txt', '20838126.txt', '22084634.txt', '22274320.txt', '22342065.txt',
  'services/data-provider.js', 'services/application-services.js', 'services/cart-functions.js', 'services/seo.js', 'services/supabase-auth.js', 'services/auth-ui.js', 'services/bitpay-pay.js',
  'repositories/supabase-repository.js', 'repositories/bootstrap.js', 'admin-product-ai.js'
];
fs.rmSync(output, { recursive:true, force:true });
for (const relative of files) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Missing Vercel static asset: ${relative}`);
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.copyFileSync(source, target);
}
const vendorDir = path.join(output, 'vendor');
fs.mkdirSync(vendorDir, { recursive:true });
for (const [source, target] of [
  [path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), path.join(vendorDir, 'supabase.js')],
  [path.join(root, 'node_modules/@supabase/supabase-js/LICENSE'), path.join(vendorDir, 'supabase-LICENSE')]
]) {
  if (!fs.existsSync(source)) throw new Error(`Supabase JS dependency asset missing: ${source}`);
  fs.copyFileSync(source, target);
}
const verificationFile = path.join(output, '20838126.txt');
if (!fs.existsSync(verificationFile) || fs.statSync(verificationFile).size !== 0) throw new Error('Vercel output must contain the empty site-verification file /20838126.txt');
console.log(`Vercel static output ready: ${files.length + 2} assets in public/`);
