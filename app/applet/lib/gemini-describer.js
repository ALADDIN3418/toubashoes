'use strict';

function compactText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  const prefix = text.slice(0, maxLength - 1);
  const sentenceEnd = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf('۔'), prefix.lastIndexOf('؟'), prefix.lastIndexOf('!'));
  if (sentenceEnd >= maxLength * 0.65) return prefix.slice(0, sentenceEnd + 1).trim();
  const wordEnd = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, wordEnd > 0 ? wordEnd : prefix.length).trim()}…`;
}

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
  const features = rawFeatures.map(value => String(value || '').trim()).filter(Boolean).slice(0, 4);
  const rawSpecifications = String(input.specifications || '').trim();
  const specifications = rawSpecifications || [
    input.sizes ? `سایزبندی: ${input.sizes}` : '',
    input.colors ? `رنگ‌بندی: ${input.colors}` : ''
  ].filter(Boolean).join('\n');
  const shortDesc = compactText(`${name} از برند ${brand}؛ برای ${usage}.`, 120);
  const detailText = [features.join('، '), specifications.replace(/[\r\n]+/g, '، ')].filter(Boolean).join('؛ ').slice(0, 220);
  const longDesc = compactText(`${name} از برند ${brand}، مناسب ${usage}.${detailText ? ` اطلاعات ثبت‌شده: ${detailText}.` : ' مشخصات فنی این محصول هنوز تکمیل نشده است.'} پیش از انتشار، جزئیات را با محصول واقعی تطبیق دهید.`, 480);
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
  "shortDesc": "معرفی کوتاه و جذاب، یک جمله، حداکثر ۱۱۰ نویسه و بدون ادعای تأییدنشده",
  "longDesc": "حداکثر سه جملهٔ کوتاه و در مجموع کمتر از ۴۵۰ نویسه؛ فقط بر اساس داده‌های ورودی",
  "features": ["حداکثر چهار ویژگی کوتاه که عیناً از داده‌های واردشده پشتیبانی شوند"],
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
          shortDesc: compactText(parsed.shortDesc, 120),
          longDesc: compactText(parsed.longDesc, 480),
          features: parsedFeatures.slice(0, 4).map(feature => compactText(feature, 100)),
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
