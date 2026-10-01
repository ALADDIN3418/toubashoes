/**
 * Centralized Prompt Template Engine for Product AI Studio
 * «استودیو هوش مصنوعی محصول - مدیریت قالب‌های پرامپت»
 *
 * Enforces strict product identity preservation:
 * - Form, shape, silhouette, dimensions
 * - Colors, hues, color-blocking
 * - Materials, leather textures, fabric patterns
 * - Logos, inscriptions, brand marks
 * - Stitching, zippers, buckles, straps, hardware
 * - Zero hallucination, zero product redesign
 */
'use strict';

const PRESETS = Object.freeze({
  'catalog-white': {
    id: 'catalog-white',
    name: 'کاتالوگ سفید',
    title: 'کاتالوگ سفید',
    icon: '📦',
    badge: 'استاندارد فروشگاهی',
    description: 'پس‌زمینه سفید یکدست، نورپردازی استاندارد و سایه ملایم طبیعی مناسب دیجی‌کالا و وب‌سایت',
    scenePrompt: 'in a clean, pure white seamless commercial catalog photography studio, crisp neutral lighting, soft grounded natural contact shadow beneath the sole and base, pristine ecommerce marketplace standard'
  },
  'dark-luxury': {
    id: 'dark-luxury',
    name: 'استودیوی لوکس',
    title: 'استودیوی لوکس',
    icon: '🖤',
    badge: 'پرمیوم و دارک',
    description: 'زمینه زغالی و گرانیت مات، هایلایت‌های ظریف حاشیه‌ای و جلوه لوکس جواهرات و چرم',
    scenePrompt: 'in a luxury dark commercial advertising studio, matte deep charcoal and obsidian stone backdrop, subtle soft rim lighting defining silhouettes and contours, restrained warm highlights on leather and metallic hardware, elegant editorial mood'
  },
  'minimal': {
    id: 'minimal',
    name: 'مینیمال',
    title: 'مینیمال',
    icon: '✨',
    badge: 'مدرن و ساده',
    description: 'سکوی سنگی مینیمال، نور روز ملایم، فضای منفی تمیز و جلوه گالری مدرن',
    scenePrompt: 'resting on an architectural smooth travertine stone pedestal, soft diffused ambient daylight, minimalist neutral beige and limestone palette, clean negative space, contemporary refined gallery aesthetic'
  },
  'lifestyle': {
    id: 'lifestyle',
    name: 'سبک زندگی',
    title: 'سبک زندگی',
    icon: '🌿',
    badge: 'طبیعی و گرم',
    description: 'محیط داخلی گرم با چوب و بتن ملایم، حس واقعی کاربرد و نور ملایم روزمره',
    scenePrompt: 'in an authentic warm modern lifestyle interior setting, subtle warm oak wood and matte architectural concrete textures, gentle natural window daylight with soft directional sunbeam, realistic physical contact shadow, natural depth of field'
  },
  'on-model': {
    id: 'on-model',
    name: 'روی مدل',
    title: 'روی مدل',
    icon: '👟',
    badge: 'نمایش پوشش',
    description: 'نمایش اندازه و استایل طبیعی روی پای مدل یا دوش مدل در زاویه تجاری بی‌نقص',
    scenePrompt: 'styled in professional editorial commercial catalog display showing natural scale and wear context, grounded flattering commercial angle, clean neutral studio floor, tasteful minimal styling, sharp focus on footwear/bag craftsmanship'
  },
  'advertising': {
    id: 'advertising',
    name: 'تبلیغاتی',
    title: 'تبلیغاتی',
    icon: '📢',
    badge: 'کمپین و بنر',
    description: 'نورپردازی دراماتیک و پویا مناسب بنرهای جشنواره، اسلایدرها و تبلیغات کمپین',
    scenePrompt: 'in a high-impact commercial advertising campaign scene, dynamic professional studio key lighting, subtle atmospheric particles, crisp specular reflections highlighting premium material textures, bold luxury brand presentation'
  },
  'custom': {
    id: 'custom',
    name: 'پس‌زمینه سفارشی',
    title: 'پس‌زمینه سفارشی',
    icon: '🎨',
    badge: 'پرامپت دلخواه',
    description: 'اعمال صحنه و نورپردازی دلخواه با رعایت ۱۰۰٪ قوانین حفظ هویت محصول',
    scenePrompt: ''
  }
});

const DEFAULT_PRESET = 'catalog-white';

const PRESERVATION_RULES = Object.freeze({
  maximum: {
    label: 'حداکثر (Maximum) - پیش‌فرض',
    instruction: 'CRITICAL CONSTRAINT: Maintain 100% exact product identity. Do NOT alter, redesign, or modify the product shape, geometry, silhouette, straps, buckles, zippers, stitching, logos, colors, leather textures, soles, or materials. No feet, legs, or distracting objects covering the item.'
  },
  high: {
    label: 'زیاد (High)',
    instruction: 'Strict product identity preservation: Maintain exact product shape, colors, materials, branding, and construction details with realistic studio light interaction.'
  },
  balanced: {
    label: 'متعادل (Balanced)',
    instruction: 'Preserve product silhouette, primary color palette, and hardware features while seamlessly integrating with the ambient lighting environment.'
  }
});

const ASPECT_RATIO_DIMENSIONS = Object.freeze({
  '1:1': { width: 1024, height: 1024, label: 'مربع ۱:۱ (اینستاگرام / محصول)' },
  '4:5': { width: 896, height: 1120, label: 'عمودی ۴:۵ (پست اینستاگرام)' },
  '3:4': { width: 864, height: 1152, label: 'عمودی ۳:۴ (کاتالوگ تجاری)' },
  '16:9': { width: 1280, height: 720, label: 'افقی ۱۶:۹ (بنر / اسلایدر)' }
});

function getPreset(styleId) {
  return PRESETS[styleId] || PRESETS[DEFAULT_PRESET];
}

function getAllPresets() {
  return Object.values(PRESETS);
}

function buildPrompt({
  style = DEFAULT_PRESET,
  customPrompt = '',
  preservation = 'maximum',
  aspectRatio = '1:1',
  productType = 'shoe_or_bag'
}) {
  const preset = getPreset(style);
  const rule = PRESERVATION_RULES[preservation] || PRESERVATION_RULES.maximum;
  const isCustom = style === 'custom';

  const sceneDescription = isCustom
    ? (customPrompt && customPrompt.trim() ? customPrompt.trim() : preset.scenePrompt || 'in a clean studio')
    : (customPrompt && customPrompt.trim() ? `${preset.scenePrompt}, ${customPrompt.trim()}` : preset.scenePrompt);

  const productSubject = productType === 'bag'
    ? 'handbag / leather bag'
    : (productType === 'shoe' ? 'footwear / shoe' : 'commercial footwear or bag product');

  return [
    `Professional high-end commercial ecommerce product photography of the exact ${productSubject} shown in the reference image.`,
    `Scene: ${sceneDescription}.`,
    rule.instruction,
    'Ensure realistic physical contact shadows, accurate surface reflections, photorealistic material rendering, razor-sharp focus on leather grain and stitching details, 8k resolution.',
    'Single product focus, clean framing, perfectly centered with natural margins, professional product photography studio.'
  ].join(' ');
}

function getNegativePrompt() {
  return [
    'redesign, modified shape, changed color, different product, distorted silhouette',
    'missing straps, missing buckles, altered logos, blurred text, sloppy stitching',
    'human feet, bare feet, ugly legs, body parts, amputated feet, deformities',
    'blurry, low quality, pixelated, noise, artifacts, watermark, text labels, borders, duplicate items, cartoon, 3d render look'
  ].join(', ');
}

module.exports = {
  PRESETS,
  DEFAULT_PRESET,
  PRESERVATION_RULES,
  ASPECT_RATIO_DIMENSIONS,
  getPreset,
  getAllPresets,
  buildPrompt,
  getNegativePrompt
};
