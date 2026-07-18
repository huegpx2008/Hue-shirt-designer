import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, 'data', 'hue-template-catalog.json');
const OUTPUT_DIR = path.join(ROOT, 'public', 'template-thumbnails');
const WIDTH = 640;
const HEIGHT = 392;

const escapeXml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const fontFamily = (value) => escapeXml(value.split(',')[0].replaceAll('"', '').trim());
const textSize = (text, max, preferred, minimum = 22) => Math.max(minimum, Math.min(preferred, Math.floor(max / Math.max(1, text.length) * 1.72)));

const text = ({ value, x, y, size, fill, family, weight = 800, anchor = 'middle', spacing = 0 }) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="${fontFamily(family)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;

const contactRows = (template, family, x, width, color) => [
  text({ value: template.callout, x: x + width / 2, y: 294, size: 22, fill: color, family: family.bodyFont, weight: 900, spacing: 1.6 }),
  text({ value: '555.555.0123  /  YOURWEBSITE.COM', x: x + width / 2, y: 325, size: 13, fill: color, family: family.bodyFont, weight: 700, spacing: 1.1 })
].join('');

const renderBand = (template, family) => {
  const headlineSize = textSize(template.headline, 510, 70, 31);
  return `
    <rect width="640" height="392" fill="${template.background}"/>
    <rect width="640" height="102" fill="${template.primary}"/>
    <rect y="102" width="640" height="14" fill="${template.accent}"/>
    <path d="M0 116 H640 L585 151 H0 Z" fill="${template.primary}" opacity=".09"/>
    ${text({ value: template.callout, x: 38, y: 61, size: 18, fill: '#ffffff', family: family.bodyFont, anchor: 'start', spacing: 2.5 })}
    ${text({ value: template.headline, x: 320, y: 211, size: headlineSize, fill: template.primary, family: family.headlineFont, spacing: 1 })}
    ${text({ value: template.subheadline, x: 320, y: 251, size: 20, fill: template.accent, family: family.bodyFont, weight: 800 })}
    ${contactRows(template, family, 105, 430, template.primary)}
    <rect y="351" width="640" height="41" fill="${template.primary}"/>
    ${text({ value: template.category.toUpperCase(), x: 320, y: 378, size: 13, fill: '#ffffff', family: family.bodyFont, weight: 900, spacing: 3 })}`;
};

const renderSplit = (template, family) => {
  const headlineSize = textSize(template.headline, 210, 52, 25);
  return `
    <rect width="640" height="392" fill="${template.background}"/>
    <rect width="244" height="392" fill="${template.primary}"/>
    <rect x="244" width="13" height="392" fill="${template.accent}"/>
    <path d="M176 0 H244 V392 H98 Z" fill="#ffffff" opacity=".055"/>
    <circle cx="58" cy="59" r="25" fill="none" stroke="${template.accent}" stroke-width="5"/>
    ${text({ value: template.category.slice(0, 2).toUpperCase(), x: 58, y: 66, size: 15, fill: '#ffffff', family: family.bodyFont, weight: 900 })}
    ${text({ value: template.headline, x: 122, y: 187, size: headlineSize, fill: '#ffffff', family: family.headlineFont, spacing: .5 })}
    ${text({ value: template.callout, x: 122, y: 229, size: 15, fill: template.accent, family: family.bodyFont, weight: 900, spacing: 1.7 })}
    <rect x="291" y="82" width="295" height="7" rx="3.5" fill="${template.accent}"/>
    ${text({ value: template.subheadline, x: 438, y: 152, size: textSize(template.subheadline, 270, 29, 18), fill: template.primary, family: family.bodyFont, weight: 900 })}
    ${text({ value: 'Clear message. Ready to customize.', x: 438, y: 194, size: 15, fill: template.primary, family: family.bodyFont, weight: 600 })}
    <rect x="320" y="229" width="236" height="58" rx="8" fill="${template.primary}"/>
    ${text({ value: '555.555.0123', x: 438, y: 265, size: 21, fill: '#ffffff', family: family.bodyFont, weight: 900, spacing: 1 })}
    ${text({ value: 'YOURWEBSITE.COM', x: 438, y: 330, size: 13, fill: template.accent, family: family.bodyFont, weight: 900, spacing: 2 })}`;
};

const renderFrame = (template, family) => {
  const headlineSize = textSize(template.headline, 490, 63, 29);
  const luxury = template.family === 'luxury-signature';
  return `
    <rect width="640" height="392" fill="${template.background}"/>
    <rect x="22" y="22" width="596" height="348" rx="${luxury ? 0 : 7}" fill="none" stroke="${template.primary}" stroke-width="9"/>
    <rect x="37" y="37" width="566" height="318" rx="${luxury ? 0 : 4}" fill="none" stroke="${template.accent}" stroke-width="2"/>
    <line x1="145" y1="91" x2="495" y2="91" stroke="${template.accent}" stroke-width="5"/>
    ${luxury ? `<path d="M270 68 Q320 42 370 68 Q320 94 270 68 Z" fill="none" stroke="${template.primary}" stroke-width="2"/>` : ''}
    ${text({ value: template.callout, x: 320, y: 72, size: 15, fill: template.primary, family: family.bodyFont, weight: 900, spacing: 2.5 })}
    ${text({ value: template.headline, x: 320, y: 184, size: headlineSize, fill: template.primary, family: family.headlineFont, spacing: luxury ? 2 : .4 })}
    ${text({ value: template.subheadline, x: 320, y: 226, size: 20, fill: template.accent, family: family.bodyFont, weight: 800 })}
    <line x1="155" y1="255" x2="485" y2="255" stroke="${template.primary}" stroke-width="2" opacity=".45"/>
    ${text({ value: '555.555.0123  /  YOURWEBSITE.COM', x: 320, y: 300, size: 15, fill: template.primary, family: family.bodyFont, weight: 800, spacing: 1 })}
    ${text({ value: template.category.toUpperCase(), x: 320, y: 335, size: 11, fill: template.accent, family: family.bodyFont, weight: 900, spacing: 3 })}`;
};

const renderThumbnail = (template, family) => {
  const content = family.layout === 'band' ? renderBand(template, family) : family.layout === 'split' ? renderSplit(template, family) : renderFrame(template, family);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(template.name)} template preview</title>
  <desc id="desc">Automatic preview for the ${escapeXml(family.name)} design family.</desc>
  <defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#00101f" flood-opacity=".18"/></filter></defs>
  <g filter="url(#shadow)">${content}</g>
  <rect x=".75" y=".75" width="638.5" height="390.5" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="1.5"/>
</svg>\n`;
};

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.templates) || !Array.isArray(catalog.families)) {
  throw new Error('Unsupported Hue template catalog. Expected schemaVersion 1 with families and templates.');
}

const families = new Map(catalog.families.map((family) => [family.id, family]));
const collectionTemplates = catalog.collections && typeof catalog.collections === 'object'
  ? Object.values(catalog.collections).flatMap((collection) => Array.isArray(collection) ? collection : [])
  : [];
const templates = [...catalog.templates, ...collectionTemplates];
await mkdir(OUTPUT_DIR, { recursive: true });

const manifest = [];
for (const template of templates) {
  const family = families.get(template.family);
  if (!family) throw new Error(`Template ${template.id} references missing family ${template.family}.`);
  const fileName = `${template.id}.svg`;
  await writeFile(path.join(OUTPUT_DIR, fileName), renderThumbnail(template, family), 'utf8');
  manifest.push({ id: template.id, file: `/template-thumbnails/${fileName}`, family: family.id, generatedFrom: 'data/hue-template-catalog.json' });
}

await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, source: 'data/hue-template-catalog.json', thumbnails: manifest }, null, 2)}\n`, 'utf8');
console.log(`Generated ${manifest.length} Hue template thumbnails in ${path.relative(ROOT, OUTPUT_DIR)}.`);
