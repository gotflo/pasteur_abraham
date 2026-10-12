# Code serveur (Hostinger, PHP)

Ce dossier est copié tel quel dans `dist/` au build (sauf ce README),
puis envoyé dans `public_html/` sur l'hébergement.

```
api/
  .htaccess            seul videos.php est accessible depuis le web
  videos.php           point d'API : GET /api/videos.php
  lib/
    .htaccess          tout est refusé (403)
    youtube-feed.php   lecture du flux, cache, repli
```

## Dernières vidéos YouTube

La section « Prédications » de l'accueil se met à jour toute seule à chaque
visite, sans rebuild et sans clé API.

1. **Au build** (`npm run build`), `scripts/build.js` lit le flux RSS public de
   la chaîne et écrit les 5 dernières vidéos dans le HTML. C'est ce que Google
   lit, et c'est ce qui reste affiché si l'API ne répond pas. Si le flux est
   injoignable pendant le build, la liste de `src/data/videos.json` est
   utilisée (`node scripts/build.js --save-videos` la met à jour).
2. **À chaque visite**, `src/assets/js/videos.js` appelle `/api/videos.php` et
   remplace le contenu de `#videoGrid`. Il formate la date relative
   (« Il y a 3 jours ») et les vues (« 1,3 M vues »), échappe tout le HTML et
   ne change rien si l'appel échoue.
3. **`api/videos.php`** lit le flux
   `https://www.youtube.com/feeds/videos.xml?channel_id=UCjnx--E5SwGATKxySKTAadA` :
   - aucune clé, aucun quota ;
   - lecture avec `DOMDocument` + `DOMXPath`, espaces de noms Atom, `yt` et
     `media` enregistrés ; champs : `videoId`, `title`, `published`, `views` ;
   - les Shorts (lien contenant `/shorts/`) et les titres en double sont
     écartés, les 5 plus récentes sont gardées ;
   - cache dans un fichier **hors du dossier public**
     (`~/.cache/abrahamandebi/`, sinon le dossier temporaire du système)
     pendant 10 minutes ;
   - si YouTube ne répond pas, la dernière liste connue est renvoyée et un
     nouvel essai a lieu 2 minutes plus tard ;
   - si aucune liste n'existe encore : réponse **503** ;
   - réponse JSON avec `Cache-Control: public, max-age=300` (5 minutes).
     L'en-tête `X-Videos-Source` indique `live`, `cache` ou `stale`.

Exemple de réponse :

```json
{
  "channelId": "UCjnx--E5SwGATKxySKTAadA",
  "updated": "2026-10-12T13:28:08+00:00",
  "videos": [
    { "videoId": "gn6wfDw2ycU", "title": "...", "published": "2026-10-08T17:10:30+00:00", "views": 84 }
  ]
}
```

Pour changer de chaîne ou de nombre de vidéos : `YT_CHANNEL_ID` et
`YT_MAX_VIDEOS` dans `api/lib/youtube-feed.php`, et `youtube` dans
`src/data/site.json` (utilisé par le build).

## Tests

```
php tests/youtube-feed.test.php      # cache, repli, 503 (sans réseau)
python tests/check_feed.py           # mêmes XPath avec lxml, contre le vrai flux
node tests/videos-client.test.js     # script navigateur avec un fetch simulé
```

## Vérifications après mise en ligne

```
curl -sI https://abrahamandebi.com/api/videos.php                  # 200, application/json
curl -s  https://abrahamandebi.com/api/videos.php | head -c 300
curl -sI https://abrahamandebi.com/api/lib/youtube-feed.php        # 403
```
