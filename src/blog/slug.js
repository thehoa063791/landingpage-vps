// Vietnamese text → URL slug, shared by the server and the admin editor (no Node modules).
// "Đầu tư tài chính là gì?" → "dau-tu-tai-chinh-la-gi"
const VI = { à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a', ă: 'a', ắ: 'a', ằ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a', â: 'a', ấ: 'a', ầ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a', đ: 'd',
  è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e', ê: 'e', ế: 'e', ề: 'e', ể: 'e', ễ: 'e', ệ: 'e', ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o', ô: 'o', ố: 'o', ồ: 'o', ổ: 'o', ỗ: 'o', ộ: 'o', ơ: 'o', ớ: 'o', ờ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u', ư: 'u', ứ: 'u', ừ: 'u', ử: 'u', ữ: 'u', ự: 'u', ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y' };

function slugify(text, max = 120) {
  return String(text || '').toLowerCase().normalize('NFC').replace(/['’‘`]/g, '').replace(/./g, ch => VI[ch] ?? ch)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

// Lowercase without accents, for matching a keyword in Vietnamese text either way.
const fold = text => String(text || '').toLowerCase().normalize('NFC').replace(/./g, ch => VI[ch] ?? ch).normalize('NFD').replace(/[̀-ͯ]/g, '');

module.exports = { slugify, fold };
