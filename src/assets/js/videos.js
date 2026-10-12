/* =========================================================
   Abraham Andebi - Dernières vidéos YouTube
   Remplace les vidéos écrites au build par la liste à jour
   servie par /api/videos.php. En cas d'échec, rien ne change.
   ========================================================= */
(function () {
  'use strict';

  var grid = document.getElementById('videoGrid');
  if (!grid || !window.fetch) return;

  var ENDPOINT = grid.getAttribute('data-endpoint') || '/api/videos.php';

  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var capitalize = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  /* « Il y a 3 jours », « Hier », « Il y a 2 semaines »... */
  var relativeDate = function (iso, now) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = Math.round((t - (now || Date.now())) / 1000); // négatif = passé
    var abs = Math.abs(diff);
    var units = [
      ['year', 31536000], ['month', 2592000], ['week', 604800],
      ['day', 86400], ['hour', 3600], ['minute', 60]
    ];
    if (abs < 60) return "À l'instant";
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][1]) {
        var n = Math.round(diff / units[i][1]);
        if (window.Intl && Intl.RelativeTimeFormat) {
          return capitalize(new Intl.RelativeTimeFormat('fr-CA', { numeric: 'auto' }).format(n, units[i][0]));
        }
        var fr = { year: ['an', 'ans'], month: ['mois', 'mois'], week: ['semaine', 'semaines'],
                   day: ['jour', 'jours'], hour: ['heure', 'heures'], minute: ['minute', 'minutes'] }[units[i][0]];
        var k = Math.abs(n);
        return 'Il y a ' + k + ' ' + (k > 1 ? fr[1] : fr[0]);
      }
    }
    return '';
  };

  /* « 84 vues », « 1,3 k vues », « 1,3 M vues » */
  var formatViews = function (n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return '';
    var num = function (x) { return x.toLocaleString('fr-CA', { maximumFractionDigits: x < 10 ? 1 : 0 }); };
    var label;
    if (n >= 999500) label = num(Math.round(n / 100000) / 10) + ' M';
    else if (n >= 1000) label = num(Math.round(n / 100) / 10) + ' k';
    else label = String(n);
    return label + (n >= 2 ? ' vues' : ' vue');
  };

  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  var card = function (v, i) {
    if (!v || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId) || !v.title) return '';
    var id = v.videoId;
    var when = relativeDate(v.published);
    var meta = [
      when ? '<time datetime="' + esc(v.published) + '">' + esc(when) + '</time>' : '',
      esc(formatViews(v.views))
    ].filter(Boolean).join(', ');
    return '<a class="sermon-card reveal in' + (i === 0 ? ' featured' : '') + '" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener">' +
      '<div class="thumb">' +
        (i === 0 ? '<span class="cat">Nouveau</span>' : '') +
        '<span class="play">' + PLAY + '</span>' +
        '<img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="' + esc(v.title) + '" width="480" height="360" loading="lazy" decoding="async">' +
      '</div>' +
      '<div class="body">' +
        '<h3>' + esc(v.title) + '</h3>' +
        (meta ? '<p class="vmeta">' + meta + '</p>' : '') +
        '<span class="meta">Regarder ' + GO + '</span>' +
      '</div>' +
    '</a>';
  };

  fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      var list = data && Array.isArray(data.videos) ? data.videos : [];
      var html = list.map(card).join('');
      if (html) grid.innerHTML = html;
    })
    .catch(function () { /* on garde les vidéos écrites au build */ });
})();
