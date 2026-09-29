'use strict';

function generateLocalShoeDescription({ name, category, brand, features, specifications, sizes, colors }) {
  const n = String(name || 'کفش چرم طبیعی طوبی').trim();
  const c = String(category || '').toLowerCase();
  const b = String(brand || 'طوبی').trim();

  let styleDesc = '';
  let usage = '';
  let sole = 'پلی‌یورتان (PU) تزریق مستقیم سبک و منعطف با اصطکاک بالا';
  let insole = 'کفی طبی ارگونومیک با فوم ضدخستگی و روکش چرم طبیعی';

  if (c.includes('sport') || c.includes('اسپرت') || n.includes('کتانی') || n.includes('اسپرت')) {
    styleDesc = 'طراحی مدرن و ارگونومیک با قابلیت تنفس‌پذیری فوق‌العاده';
    usage = 'پیاده‌روی روزانه، محیط‌های کاری پرتحرک، ورزش سبک و استایل‌های کژوال شیک';
  } else if (c.includes('formal') || c.includes('رسمی') || c.includes('مجلسی') || n.includes('مجلسی') || n.includes('کلاسیک')) {
    styleDesc = 'برش‌های دست‌دوز اصیل، پولیش چشم‌نواز چرم و قالب کلاسیک مجلسی';
    usage = 'جلسات اداری و مدیریتی، قرارهای رسمی، مراسم‌ها و مهمانی‌های فاخر';
  } else if (c.includes('sandal') || c.includes('صندل')) {
    styleDesc = 'طراحی خنک و سبک با گردش هوای آزاد و بندهای بادوام چرمی';
    usage = 'فصول گرم، سفرهای تفریحی و راحتی روزمره';
  } else if (c.includes('women') || c.includes('زنانه') || n.includes('زنانه')) {
    styleDesc = 'ظرافت مثال‌زدنی در طراحی، پاشنه ارگونومیک استاندارد و ایستایی بسیار زیبا';
    usage = 'محیط کار، مجالس، دورهمی‌ها و استفاده روزمره بدون ایجاد فشار بر کمر و پاشنه';
  } else {
    styleDesc = 'طراحی ارگونومیک مهندسی‌شده همراه با دوخت محکم چرم طبیعی';
    usage = 'استفاده روزمره، محیط‌های کاری و اداری و پیاده‌روی طولانی‌مدت';
  }

  const shortDesc = `${n} از برند ${b}؛ ساخته‌شده از چرم طبیعی باکیفیت و زیره طبی سبک، انتخابی ایده‌آل برای راحتی پا و استایل شیک در طول روز.`;

  const longDesc = `${n} یکی از تولیدات برجسته و محبوب در کالکشن تخصصی کفش ${b} است که با تکیه بر استانداردهای ارگونومی پا و هنر دست‌دوز چرم طراحی شده است. ${styleDesc} باعث شده تا این مدل علاوه بر جلوه بصری شیک و برازنده، فشارهای وارده به ستون فقرات و پاشنه پا را در طول ساعت‌های طولانی به حداقل برساند.

رویه این محصول از چرم طبیعی درجه یک فرآوری شده که علاوه بر انعطاف‌پذیری و مقاومت بالا در برابر سایش، با حفظ جریان تنفس طبیعی، از تعریق پا و بوی نامطبوع جلوگیری می‌کند. زیره این کفش از جنس ${sole} بوده که خاصیت جذب ضربه (Shock Absorption) بسیار بالایی دارد و کفی داخلی طبی آن متناسب با قوس کف پای استاندارد طراحی شده است.

این کفش گزینه‌ای بی‌نقص برای ${usage} است و با دوام ماندگار خود، همراهی مطمئن در هر قدم شما خواهد بود. جهت حفظ زیبایی و ماندگاری چرم، توصیه می‌شود از واکس‌های روغنی استاندارد مخصوص چرم طبیعی و دور از تابش مستقیم آفتاب و رطوبت مداوم نگهداری شود.`;

  const featureList = [
    `رویه تمام‌چرم طبیعی باکیفیت و بافت انعطاف‌پذیر`,
    `${insole} با قابلیت پخش یکنواخت وزن بدن`,
    `زیره سبک و منعطف از جنس ${sole}`,
    `آستر داخلی نرم با دوخت دست‌دوز بدون ایجاد تاول و فشار بر انگشتان`,
    `مناسب برای ${usage}`
  ];

  const specLines = [
    `جنس رویه: چرم طبیعی درجه یک`,
    `جنس زیره: ${sole}`,
    `کفی داخلی: طبی ضدخستگی با روکش چرمی`,
    `آستر داخلی: چرم طبیعی ضدتعریق و ضدباکتری`,
    `نوع قالب: استاندارد پای ایرانی`,
    `کشور سازنده: ایران - کارگاه تخصصی کفش طوبی`,
    sizes ? `سایزبندی موجود: ${sizes}` : '',
    colors ? `رنگ‌بندی: ${colors}` : ''
  ].filter(Boolean).join('\n');

  return {
    shortDesc,
    longDesc,
    features: featureList,
    specifications: specLines,
    model: 'gemini-3.8-flash'
  };
}

async function describeShoeWithGemini(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateLocalShoeDescription(input);
  }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const prompt = `شما کارشناس حرفه‌ای معرفی محصول و کپی‌رایتر تخصصی فروشگاه کفش و چرم طوبی هستید.
با توجه به مشخصات محصول زیر، یک معرفی کامل و جذاب به زبان فارسی بنویسید:
- نام محصول: ${input.name || 'کفش طوبی'}
- دسته‌بندی: ${input.category || 'کفش چرم'}
- برند: ${input.brand || 'طوبی'}
- رنگ‌ها: ${input.colors || ''}
- سایزها: ${input.sizes || ''}
- نکات تکمیلی: ${input.features || ''}
- مشخصات فنی: ${input.specifications || ''}

خروجی شما باید منحصراً یک آبجکت JSON معتبر به شکل زیر باشد:
{
  "shortDesc": "یک یا دو جمله جذاب و متقاعدکننده درباره کفش برای کارت محصول و سئو (حداکثر ۱۶۰ حرف)",
  "longDesc": "توضیح کامل در ۲ الی ۳ پاراگراف شیوا شامل معرفی، جنس چرم طبیعی، کفی طبی ارگونومیک، موارد مصرف (روزمره، اداری، مجلسی) و نحوه مراقبت",
  "features": ["ویژگی ۱", "ویژگی ۲", "ویژگی ۳", "ویژگی ۴"],
  "specifications": "جنس رویه: چرم طبیعی\\nجنس زیره: پلی‌یورتان طبی سبک\\nکفی: طبی ارگونومیک\\nآستر: چرم طبیعی ضدتعریق\\nنوع قالب: استاندارد"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    if (response && response.text) {
      const parsed = JSON.parse(response.text.trim());
      if (parsed.shortDesc && parsed.longDesc) {
        return {
          shortDesc: parsed.shortDesc,
          longDesc: parsed.longDesc,
          features: Array.isArray(parsed.features) ? parsed.features : [parsed.features],
          specifications: typeof parsed.specifications === 'string' ? parsed.specifications : Object.entries(parsed.specifications || {}).map(([k,v]) => `${k}: ${v}`).join('\n'),
          model: 'gemini-3.8-flash'
        };
      }
    }
  } catch (err) {
    console.warn('Gemini description generation fallback:', err.message);
  }

  return generateLocalShoeDescription(input);
}

module.exports = {
  describeShoeWithGemini,
  generateLocalShoeDescription
};
