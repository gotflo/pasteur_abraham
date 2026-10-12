// Test du script navigateur src/assets/js/videos.js avec un fetch simulé.
// Usage : node tests/videos-client.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'js', 'videos.js'), 'utf8');
const BUILD_HTML = '<a class="sermon-card">vidéo écrite au build</a>';
const DAY = 86400000;

const run = async (fetchImpl) => {
  const grid = { innerHTML: BUILD_HTML, getAttribute: () => '/api/videos.php' };
  const calls = [];
  const window = {
    Intl,
    fetch: (url, opts) => { calls.push(url); return fetchImpl(url, opts); },
  };
  const ctx = { window, document: { getElementById: (id) => (id === 'videoGrid' ? grid : null) }, fetch: window.fetch, Date, Math, String, Array, isFinite, isNaN, Intl };
  vm.runInNewContext(code, ctx);
  await new Promise((r) => setTimeout(r, 20));
  return { html: grid.innerHTML, calls };
};

const json = (status, body) => () => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

(async () => {
  const now = Date.now();
  const videos = [
    { videoId: 'AAAAAAAAAAA', title: 'Titre <script>alert(1)</script> & "co"', published: new Date(now - 3 * DAY).toISOString(), views: 1250000 },
    { videoId: 'BBBBBBBBBBB', title: 'Deuxième', published: new Date(now - DAY).toISOString(), views: 1 },
    { videoId: 'CCCCCCCCCCC', title: 'Troisième', published: new Date(now - 14 * DAY).toISOString(), views: 1340 },
    { videoId: 'bad id"><img', title: 'Identifiant invalide', published: new Date(now).toISOString(), views: 5 },
  ];

  // 1. Réponse valide : la liste remplace le contenu, HTML échappé.
  let r = await run(json(200, { videos }));
  assert.deepStrictEqual(r.calls, ['/api/videos.php']);
  assert.ok(!r.html.includes('vidéo écrite au build'), 'le contenu doit être remplacé');
  assert.ok(!r.html.includes('<script>'), 'le titre doit être échappé');
  assert.ok(r.html.includes('Titre &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;'));
  assert.ok(!r.html.includes('Identifiant invalide'), 'un identifiant invalide est ignoré');
  assert.strictEqual((r.html.match(/class="sermon-card/g) || []).length, 3);
  assert.ok(r.html.includes('Il y a 3 jours'), 'date relative en français');
  assert.ok(r.html.includes('Hier'), '« Hier » pour la veille');
  assert.ok(r.html.includes('Il y a 2 semaines'));
  assert.ok(r.html.includes('1,3 M vues'), 'vues en millions');
  assert.ok(r.html.includes('1,3 k vues'), 'vues en milliers');
  assert.ok(r.html.includes('1 vue<') || r.html.includes('1 vue</p>'), 'singulier');
  assert.ok(r.html.includes('sermon-card reveal in featured'), 'la première vidéo est mise en avant');
  assert.ok(r.html.includes('https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg'));
  console.log('réponse valide         ok');

  // 2. Erreur HTTP (503) : rien ne change.
  r = await run(json(503, { error: 'indisponible' }));
  assert.strictEqual(r.html, BUILD_HTML);
  console.log('erreur 503             ok');

  // 3. Panne réseau : rien ne change.
  r = await run(() => Promise.reject(new Error('réseau')));
  assert.strictEqual(r.html, BUILD_HTML);
  console.log('panne réseau           ok');

  // 4. JSON inattendu ou liste vide : rien ne change.
  r = await run(json(200, { videos: [] }));
  assert.strictEqual(r.html, BUILD_HTML);
  r = await run(json(200, { autre: true }));
  assert.strictEqual(r.html, BUILD_HTML);
  console.log('liste vide ou invalide ok');

  console.log('Tous les tests passent.');
})().catch((e) => { console.error(e); process.exit(1); });
