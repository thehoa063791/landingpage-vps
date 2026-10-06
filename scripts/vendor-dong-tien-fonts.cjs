// Vendor fonts once; visitors load only the local CSS and font files.
const fs = require('node:fs/promises');
const path = require('node:path');
const directory = path.join(__dirname, '../pages/dong-tien/public/fonts');
const families = ['Open+Sans:ital,wght@0,400;0,600;0,700;1,400', 'Be+Vietnam+Pro:wght@400;500;600;700', 'Figtree:wght@300..900', 'Montserrat:ital,wght@0,400..900;1,700', 'Playfair+Display:ital,wght@0,400..900;1,500', 'Paytone+One', 'Oswald:wght@700', 'Inter:wght@400..900'];
async function main() {
  await fs.mkdir(directory, { recursive: true });
  const response = await fetch(`https://fonts.googleapis.com/css2?${families.map(f => `family=${f}`).join('&')}&display=swap`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' } });
  if (!response.ok) throw new Error(`Font stylesheet: ${response.status}`);
  let css = await response.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(match => match[1]))];
  for (let offset = 0; offset < urls.length; offset += 8) {
    await Promise.all(urls.slice(offset, offset + 8).map(async url => {
      const font = await fetch(url);
      if (!font.ok) throw new Error(`Font download: ${font.status}`);
      await fs.writeFile(path.join(directory, path.basename(new URL(url).pathname)), Buffer.from(await font.arrayBuffer()));
    }));
  }
  for (const url of urls) css = css.replaceAll(url, `./${path.basename(new URL(url).pathname)}`);
  await fs.writeFile(path.join(directory, 'local-fonts.css'), css);
  for (const family of ['opensans', 'bevietnampro', 'figtree', 'montserrat', 'playfairdisplay', 'paytoneone', 'oswald', 'inter']) {
    const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`);
    if (!license.ok) throw new Error(`Font license ${family}: ${license.status}`);
    await fs.writeFile(path.join(directory, `${family}-OFL.txt`), await license.text());
  }
  console.log(`Vendored ${urls.length} font files and eight font licenses.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
