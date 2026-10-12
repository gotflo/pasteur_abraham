// Build of the Abraham Andebi website: src/ + public/ + server/ -> dist/
//  - shared <head> (canonical, robots, Open Graph, Twitter, JSON-LD)
//  - CSS/JS copied to /assets/build/ with a content hash in the name
//  - latest YouTube videos written into the HTML (fallback + what Google reads)
//  - sitemap.xml and robots.txt
// Usage: node scripts/build.js [--save-videos]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const site = JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'site.json'), 'utf8'));
const VIDEOS_FALLBACK = path.join(SRC, 'data', 'videos.json');

const abs = (p) => (/^https?:/.test(p) ? p : site.url + p);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lf = (s) => s.replace(/\r\n/g, '\n');

/* ---------- files ---------- */
const copyDir = (from, to, skip = () => false) => {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (skip(e.name)) continue;
    if (e.isDirectory()) copyDir(s, d, skip);
    else if (/\.(html|css|js|php|txt|xml|json|md)$|^\.htaccess$/.test(e.name)) fs.writeFileSync(d, lf(fs.readFileSync(s, 'utf8')));
    else fs.copyFileSync(s, d);
  }
};

const hashAssets = () => {
  const map = {};
  const out = path.join(DIST, 'assets', 'build');
  fs.mkdirSync(out, { recursive: true });
  for (const dir of ['css', 'js']) {
    for (const name of fs.readdirSync(path.join(SRC, 'assets', dir))) {
      const body = lf(fs.readFileSync(path.join(SRC, 'assets', dir, name), 'utf8'));
      const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 10);
      const ext = path.extname(name);
      const file = `${path.basename(name, ext)}.${hash}${ext}`;
      fs.writeFileSync(path.join(out, file), body);
      map[name] = `/assets/build/${file}`;
    }
  }
  return map;
};

/* ---------- YouTube (même règles que server/api/lib/youtube-feed.php) ---------- */
const decodeXml = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const parseFeed = (xml, max) => {
  const pick = (block, re) => { const m = block.match(re); return m ? decodeXml(m[1]).trim() : ''; };
  const seen = new Set();
  const videos = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const videoId = pick(entry, /<yt:videoId>([^<]*)<\/yt:videoId>/);
    const title = pick(entry, /<title>([\s\S]*?)<\/title>/);
    const published = pick(entry, /<published>([^<]*)<\/published>/);
    const link = pick(entry, /<link rel="alternate" href="([^"]*)"/);
    const views = pick(entry, /<media:statistics views="(\d+)"/);
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title) continue;
    if (link.includes('/shorts/')) continue;
    const key = title.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    videos.push({ videoId, title, published, views: views ? +views : null });
  }
  return videos.sort((a, b) => b.published.localeCompare(a.published)).slice(0, max);
};

const loadVideos = async () => {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${site.youtube.channelId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const videos = parseFeed(await res.text(), site.youtube.maxVideos);
    if (!videos.length) throw new Error('flux vide');
    if (process.argv.includes('--save-videos')) {
      fs.writeFileSync(VIDEOS_FALLBACK, JSON.stringify(videos, null, 2) + '\n');
    }
    console.log(`videos     ${videos.length} depuis le flux YouTube`);
    return videos;
  } catch (err) {
    console.warn(`videos     flux injoignable (${err.message}), repli sur src/data/videos.json`);
    return JSON.parse(fs.readFileSync(VIDEOS_FALLBACK, 'utf8'));
  }
};

const formatDate = (iso) => new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).format(new Date(iso));
const formatViews = (n) => {
  if (typeof n !== 'number') return '';
  const num = (x) => x.toLocaleString('fr-CA', { maximumFractionDigits: x < 10 ? 1 : 0 });
  let label;
  if (n >= 999500) label = num(Math.round(n / 100000) / 10) + ' M';
  else if (n >= 1000) label = num(Math.round(n / 100) / 10) + ' k';
  else label = String(n);
  return label + (n >= 2 ? ' vues' : ' vue');
};

const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const videoCards = (videos) => videos.map((v, i) => {
  const meta = [
    v.published ? `<time datetime="${esc(v.published)}">${esc(formatDate(v.published))}</time>` : '',
    esc(formatViews(v.views)),
  ].filter(Boolean).join(' · ');
  return `        <a class="sermon-card reveal${i ? ` d${Math.min(i, 3)}` : ' featured'}" href="https://www.youtube.com/watch?v=${v.videoId}" target="_blank" rel="noopener">
          <div class="thumb">
            ${i === 0 ? '<span class="cat">Nouveau</span>\n            ' : ''}<span class="play">${PLAY}</span>
            <img src="https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg" alt="${esc(v.title)}" width="480" height="360" loading="lazy" decoding="async">
          </div>
          <div class="body">
            <h3>${esc(v.title)}</h3>
            ${meta ? `<p class="vmeta">${meta}</p>\n            ` : ''}<span class="meta">Regarder ${GO}</span>
          </div>
        </a>`;
}).join('\n');

/* ---------- pages ---------- */
const readPage = (file) => {
  const raw = lf(fs.readFileSync(file, 'utf8'));
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${file}: en-tête --- manquant`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  meta.scripts = (meta.scripts || '').split(',').map((s) => s.trim()).filter(Boolean);
  meta.robots = meta.robots || 'index';
  return { meta, body: raw.slice(m[0].length), file };
};

const render = (tpl, ctx, file) => {
  const get = (key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
    if (v === undefined) throw new Error(`${file}: valeur inconnue {{ ${key} }}`);
    return v;
  };
  return tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => get(k))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(get(k)));
};

const jsonLd = () => {
  const church = `${site.url}/#eglise`;
  const person = `${site.url}/#pasteur`;
  const a = site.address;
  const graph = [
    {
      '@type': ['Church', 'Organization'],
      '@id': church,
      name: site.church.name,
      url: site.church.url,
      email: site.email,
      telephone: site.telephone,
      address: { '@type': 'PostalAddress', ...a },
      hasMap: site.mapUrl,
      areaServed: site.areaServed.map((name) => ({ '@type': 'Place', name })),
      employee: { '@id': person },
    },
    {
      '@type': 'Person',
      '@id': person,
      name: site.person.name,
      honorificPrefix: site.person.honorificPrefix,
      jobTitle: site.person.jobTitle,
      description: site.person.description,
      url: site.url + '/',
      image: abs(site.person.image),
      email: site.email,
      telephone: site.telephone,
      sameAs: Object.values(site.social),
      worksFor: { '@id': church },
    },
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#site`,
      url: site.url + '/',
      name: site.siteName,
      inLanguage: site.lang,
      about: { '@id': person },
      publisher: { '@id': person },
    },
  ];
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
  return `  <script type="application/ld+json">\n${json}\n  </script>\n`;
};

const head = (meta, assets) => {
  const indexable = meta.robots !== 'noindex';
  const url = indexable ? abs(meta.path) : null;
  const img = site.image;
  const lines = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}" />`,
    url && `<link rel="canonical" href="${url}" />`,
    `<meta name="theme-color" content="${site.themeColor}" />`,
    `<meta name="author" content="${esc(site.person.name)}" />`,
    '',
    '<!-- Open Graph -->',
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${esc(site.siteName)}" />`,
    `<meta property="og:locale" content="${site.ogLocale}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    url && `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${abs(img.src)}" />`,
    `<meta property="og:image:width" content="${img.width}" />`,
    `<meta property="og:image:height" content="${img.height}" />`,
    `<meta property="og:image:alt" content="${esc(img.alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${abs(img.src)}" />`,
    `<meta name="twitter:image:alt" content="${esc(img.alt)}" />`,
    '',
    `<link rel="icon" type="image/png" href="${site.logo.src}" />`,
    `<link rel="apple-touch-icon" href="${site.logo.src}" />`,
    '',
    '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />',
    meta.preload && `<link rel="preload" as="image" href="${meta.preload}" type="image/webp" fetchpriority="high" />`,
    `<link rel="stylesheet" href="${assets['style.css']}" />`,
  ].filter((l) => l !== null && l !== undefined && l !== false);
  return lines.map((l) => (l ? '  ' + l : '')).join('\n') + '\n' + (meta.jsonld === 'home' ? jsonLd() : '');
};

const outName = (p) => (p === '/' ? 'index.html' : p.replace(/^\//, '').replace(/\.html$/, '') + '.html');

const lastmod = (file) => {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cI', '--', path.relative(ROOT, file)], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (d) return d.slice(0, 10);
  } catch (_) { /* pas de git */ }
  return new Date().toISOString().slice(0, 10);
};

const checkLengths = ({ meta, file }) => {
  const t = [...meta.title].length, d = [...meta.description].length;
  const name = path.basename(file);
  if (meta.robots === 'noindex') return;
  if (t < 50 || t > 60) console.warn(`attention  ${name}: titre de ${t} caractères (50 à 60 visés)`);
  if (d < 140 || d > 160) console.warn(`attention  ${name}: description de ${d} caractères (140 à 160 visés)`);
};

(async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'public'), DIST);
  copyDir(path.join(ROOT, 'server'), DIST, (name) => name === 'README.md');
  const assets = hashAssets();
  const videos = await loadVideos();

  const pages = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html'))
    .map((f) => readPage(path.join(SRC, 'pages', f)));

  const sitemap = [];
  for (const page of pages) {
    const { meta } = page;
    checkLengths(page);
    const body = render(page.body, { site, videos: videoCards(videos) }, page.file);
    const scripts = meta.scripts.map((s) => {
      if (!assets[s]) throw new Error(`${page.file}: script inconnu ${s}`);
      return `  <script src="${assets[s]}" defer></script>`;
    }).join('\n');
    const html = `<!DOCTYPE html>\n<html lang="${site.lang}">\n<head>\n${head(meta, assets)}</head>\n<body>\n\n${body.trimEnd()}\n\n${scripts}\n</body>\n</html>\n`;
    fs.writeFileSync(path.join(DIST, outName(meta.path)), html);
    if (meta.robots !== 'noindex') sitemap.push({ loc: abs(meta.path), lastmod: lastmod(page.file) });
    console.log(`page       ${meta.path.padEnd(10)} -> ${outName(meta.path)}`);
  }

  sitemap.sort((a, b) => a.loc.length - b.loc.length);
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemap.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n') +
    '\n</urlset>\n');
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nDisallow: /api/\n\nSitemap: ${site.url}/sitemap.xml\n`);
  console.log(`sitemap    ${sitemap.length} adresses`);
  console.log('Build terminé dans dist/');
})().catch((err) => { console.error(err); process.exit(1); });
