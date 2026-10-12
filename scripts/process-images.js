// Image optimization pipeline for the Abraham Andebi website.
// Produces web-optimized WebP + JPG fallbacks from the raw source photos.
// Usage: node scripts/process-images.js [name ...]  (no name = every job)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'img');
const OUT = path.join(__dirname, '..', 'public', 'assets', 'img');
fs.mkdirSync(OUT, { recursive: true });

// [source, output-basename, max-width]
const jobs = [
  ['7I0A3084.JPG', 'hero',      1800],
  ['7I0A3084.JPG', 'portrait',  1100],
  ['7I0A3118.JPG', 'about',     1100],
  ['7I0A3127.JPG', 'about-2',   1100],
  ['fcb1.jpg',     'preach-1',  1400],
  ['fcb2.jpg',     'preach-2',  1400],
  ['fcb4.jpg',     'preach-3',  1600],
  ['fcb3.jpg',     'ministry',  1600],
];

const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.includes(name);

(async () => {
  for (const [src, name, width] of jobs) {
    if (!wanted(name)) continue;
    const input = sharp(path.join(SRC, src)).rotate(); // auto-orient via EXIF
    const resized = input.resize({ width, withoutEnlargement: true });

    await resized.clone().webp({ quality: 78 }).toFile(path.join(OUT, `${name}.webp`));
    await resized.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, `${name}.jpg`));

    const { size } = fs.statSync(path.join(OUT, `${name}.webp`));
    console.log(`${name.padEnd(10)} ${(size / 1024).toFixed(0)} KB (webp)`);
  }

  // Social sharing image (Open Graph / Twitter): 1200x630, JPG only
  if (wanted('og')) {
    await sharp(path.join(SRC, '7I0A3084.JPG')).rotate()
      .resize({ width: 1200, height: 630, fit: 'cover', position: 'top' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(OUT, 'og-image.jpg'));
    console.log('og-image   1200x630 (jpg)');
  }

  if (wanted('logo')) {
    // Logo: keep PNG
    await sharp(path.join(SRC, 'logo.png')).resize({ width: 600 }).png({ quality: 90 }).toFile(path.join(OUT, 'logo.png'));
    // White logo variant for dark backgrounds (recolor black -> white)
    await sharp(path.join(SRC, 'logo.png'))
      .resize({ width: 600 })
      .negate({ alpha: false })
      .toFile(path.join(OUT, 'logo-white.png'));
  }

  console.log('Done.');
})();
