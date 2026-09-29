'use strict';

function generateLocalShoeDescription(input = {}) {
  const name = String(input.name || 'کفش طوبی').trim().slice(0, 160);
  const brand = String(input.brand || 'طوبی').trim().slice(0, 100);
  const category = String(input.category || '').trim().toLowerCase();
  const usage = category.includes('sport') || category.includes('اسپرت') || name.includes('اسپرت') || name.includes('کتانی')
    ? 'استفاده روزمره و استایل‌های کژوال'
    : category.includes('formal') || category.includes('رسمی') || category.includes('مجلسی') || name.includes('مجلسی')
      ? 'محیط کار و موقعیت‌های رسمی'
      : category.includes('sandal') || category.includes('صندل') || name.includes('صندل')
        ? 'روزهای گرم و استفاده روزمره'
        : 'استفاده روزمره';
  const rawFeatures = Array.isArray(input.features)
    ? input.features
    : String(input.features || '').split(/[\r\n,]+/);
  const features = rawFeatures.map(value => String(value || '').trim()).filter(Boolean).slice(0, 8);
  const rawSpecifications = String(input.specifications || '').trim();
  const specifications = rawSpecifications || [
    input.sizes ? `سایزبندی موجود: ${input.sizes}` : '',
    input.colors ? `رنگ‌بندی: ${input.colors}` : ''
  ].filter(Boolean).join('\n');
  const shortDesc = `${name} از برند ${brand}، مدلی برای ${usage}. جزئیات و مشخصات درج‌شده را پیش از خرید بررسی کنید.`;
  const detailText = [
    input.features ? `ویژگی‌های ثبت‌شده:\n${String(Array.isArray(input.features) ? input.features.join('\n') : input.features).slice(0, 900)}` : '',
    specifications ? `مشخصات واردشده:\n${specifications.slice(0, 900)}` : ''
  ].filter(Boolean).join('\n\n');
  const longDesc = `${name} از برند ${brand}، با توجه به دسته‌بندی و اطلاعات ثبت‌شده برای ${usage} معرفی می‌شود. این متن یک پیش‌نویس عمومی است و فقط ویژگی‌هایی را بازتاب می‌دهد که در فرم محصول وارد شده‌اند.\n\n${detailText || 'هنوز مشخصات فنی یا ویژگی‌های اختصاصی این محصول ثبت نشده‌اند. پیش از انتشار، جنس، ساختار، سایزبندی و سایر جزئیات را از منبع معتبر تکمیل کنید.'}\n\nپیش از انتشار، توضیحات را با کالای واقعی و سیاست‌های فروشگاه تطبیق دهید.`;
  return {
    shortDesc,
    longDesc,
    features: features.length ? features : [`مناسب برای ${usage}`, 'جزئیات محصول را با اطلاعات ثبت‌شده در فروشگاه بررسی کنید.'],
    specifications,
    model: 'local-draft'
  };
}

async function describeShoeWithGemini(input = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return generateLocalShoeDescription(input);

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const prompt = `شما نویسندهٔ توضیحات محصول فروشگاه کفش طوبی هستید. یک پیش‌نویس دقیق و خوش‌خوان فارسی تولید کنید.
فقط اطلاعات موجود در ورودی را به‌عنوان واقعیت بیان کنید. دربارهٔ جنس چرم، زیره، کفی طبی، راحتی، دوام، سلامت پا، کشور سازنده یا مزایای فنی چیزی را حدس نزنید. اگر مشخصه‌ای وارد نشده، آن را حذف کنید و از مشتری بخواهید جزئیات را پیش از انتشار بررسی کند.
نام: ${input.name || ''}
دسته‌بندی: ${input.category || ''}
برند: ${input.brand || ''}
رنگ‌ها: ${input.colors || ''}
سایزها: ${input.sizes || ''}
ویژگی‌های ثبت‌شده: ${input.features || ''}
مشخصات فنی ثبت‌شده: ${input.specifications || ''}

فقط یک JSON معتبر با این ساختار برگردان:
{
  "shortDesc": "معرفی کوتاه و جذاب، حداکثر ۱۶۰ نویسه و بدون ادعای تأییدنشده",
  "longDesc": "دو پاراگراف فارسی، فقط بر اساس داده‌های ورودی؛ در صورت کمبود اطلاعات، پیش‌نویس بودن و نیاز به تکمیل را شفاف بگو",
  "features": ["ویژگی‌هایی که عیناً از داده‌های واردشده پشتیبانی می‌شوند"],
  "specifications": "مشخصات فنی واردشده، بدون افزودن مورد جدید"
}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    if (response?.text) {
      const parsed = JSON.parse(response.text.trim());
      if (parsed.shortDesc && parsed.longDesc) {
        const parsedFeatures = Array.isArray(parsed.features) ? parsed.features : [parsed.features].filter(Boolean);
        return {
          shortDesc: String(parsed.shortDesc),
          longDesc: String(parsed.longDesc),
          features: parsedFeatures.map(String),
          specifications: typeof parsed.specifications === 'string'
            ? parsed.specifications
            : Object.entries(parsed.specifications || {}).map(([key, value]) => `${key}: ${value}`).join('\n'),
          model: 'gemini-3.8-flash'
        };
      }
    }
  } catch (error) {
    console.warn('Gemini description generation fallback:', error.message);
  }
  return generateLocalShoeDescription(input);
}

module.exports = { describeShoeWithGemini, generateLocalShoeDescription };
