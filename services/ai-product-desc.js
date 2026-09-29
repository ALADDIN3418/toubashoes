// Smart product description generator with @google/genai and robust fallback
function generateLocalShoeDescription({ name, category, brand, features, specifications, sizes, colors }) {
  const brandName = brand || 'طوبی';
  const cat = String(category || '').toLowerCase();
  const n = String(name || '').trim();

  let typeDesc = 'کفش چرم طبیعی دست‌دوز و طبی';
  let usage = 'محیط‌های کاری، اداری، دانشگاهی و استفاده روزمره';
  if (cat.includes('اسپرت') || cat.includes('sport') || n.includes('کتانی') || n.includes('اسپرت')) {
    typeDesc = 'کفش اسپرت ارگونومیک و سبک چرمی';
    usage = 'پیاده‌روی روزانه، فعالیت‌های پرتحرک و استایل کژوال مدرن';
  } else if (cat.includes('مجلسی') || cat.includes('رسمی') || cat.includes('formal') || n.includes('مجلسی') || n.includes('آکسفورد')) {
    typeDesc = 'کفش رسمی و کلاسیک تمام‌چرم طبیعی';
    usage = 'جلسات اداری، مهمانی‌های رسمی و استایل کت‌وشلوار شیک';
  } else if (cat.includes('صندل') || cat.includes('sandal') || n.includes('صندل')) {
    typeDesc = 'صندل چرمی طبی و تنفس‌پذیر';
    usage = 'فصول گرم سال، پیاده‌روی راحت و گردش مناسب هوا برای جلوگیری از تعریق پا';
  } else if (cat.includes('بوت') || cat.includes('نیم‌بوت') || n.includes('بوت')) {
    typeDesc = 'نیم‌بوت چرم طبیعی مقاوم و بادوام';
    usage = 'فصول پاییز و زمستان، محافظت در برابر سرما و رطوبت با استایل چشم‌نواز';
  }

  const shortDesc = ;

  const longDesc = ;

  const defaultFeatures = [
    'رویه تهیه شده از چرم طبیعی مرغوب و تنفس‌پذیر',
    'کفی طبی ارگونومیک ضدخستگی متناسب با انحنای کف پا',
    'زیره سبک و منعطف پلی‌یورتان مقاوم در برابر سایش و لغزش',
    'دوخت دقیق و دست‌دوز با استحکام فوق‌العاده بالا',
    'آستر داخلی بهداشتی با تهویه مناسب و ضدتعریق'
  ];

  const defaultSpecs = [
    ,
    'جنس رویه: چرم طبیعی درجه یک',
    'جنس زیره: پلی‌یورتان طبی (PU) سبک و ارتجاعی',
    'نوع کفی: طبی قابل تعویض با روکش چرم',
    'آستر داخلی: چرم طبیعی ضدباکتری',
    'نوع بسته شدن: ارگونومیک و استاندارد',
    ,
    ,
    'گارانتی: تضمین اصالت و سلامت فیزیکی طوبی'
  ].join('
');

  return {
    shortDesc,
    longDesc,
    features: features ? features.split(/?
/).filter(Boolean) : defaultFeatures,
    specifications: specifications || defaultSpecs
  };
}

module.exports = { generateLocalShoeDescription };
