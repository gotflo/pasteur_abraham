<?php
// Test du script serveur (cache, repli, 503) sans dépendre de YouTube.
// Usage : php tests/youtube-feed.test.php
declare(strict_types=1);

$tmp = sys_get_temp_dir() . '/yt-test-' . getmypid();
mkdir($tmp);
putenv('HOME=' . $tmp);
$_SERVER['DOCUMENT_ROOT'] = __DIR__;

require __DIR__ . '/../server/api/lib/youtube-feed.php';

function check(bool $ok, string $label): void
{
    echo ($ok ? 'ok    ' : 'ÉCHEC ') . $label . PHP_EOL;
    if (!$ok) {
        exit(1);
    }
}

$xml = <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Message A</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAAA"/><published>2026-10-01T10:00:00+00:00</published>
  <media:group><media:community><media:statistics views="1250"/></media:community></media:group></entry>
 <entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>Un short</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/BBBBBBBBBBB"/><published>2026-10-03T10:00:00+00:00</published></entry>
 <entry><yt:videoId>CCCCCCCCCCC</yt:videoId><title>message   a</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=CCCCCCCCCCC"/><published>2026-09-20T10:00:00+00:00</published></entry>
 <entry><yt:videoId>DDDDDDDDDDD</yt:videoId><title>Message &lt;D&gt; &amp; co</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=DDDDDDDDDDD"/><published>2026-10-02T10:00:00+00:00</published></entry>
</feed>
XML;

$v = yt_parse_feed($xml);
check(array_column($v, 'videoId') === ['DDDDDDDDDDD', 'AAAAAAAAAAA'], 'Shorts et doublons écartés, tri du plus récent');
check($v[0]['title'] === 'Message <D> & co' && $v[1]['views'] === 1250 && $v[0]['views'] === null, 'titre décodé et vues');
check(yt_parse_feed('pas du xml') === null, 'XML invalide refusé');

$dir = yt_cache_dir();
check($dir !== null && strpos($dir, realpath($tmp)) === 0, 'cache hors du dossier public');
$file = $dir . '/youtube-' . YT_CHANNEL_ID . '.json';

$fail = function () { return null; };
$ok = function () use ($xml) { return $xml; };

check(yt_latest_videos($fail) === null, 'aucune liste et YouTube muet : null (503)');

$r = yt_latest_videos($ok);
check($r['source'] === 'live' && count($r['videos']) === 2, 'premier appel : lecture du flux');
$c = json_decode(file_get_contents($file), true);
check($c['expires'] - time() > 590 && $c['expires'] - time() <= 600, 'cache de 10 minutes');

$r = yt_latest_videos($fail);
check($r['source'] === 'cache', 'appel suivant servi depuis le cache');

$c['expires'] = time() - 1;
file_put_contents($file, json_encode($c));
$r = yt_latest_videos($fail);
$c2 = json_decode(file_get_contents($file), true);
check($r['source'] === 'stale' && count($r['videos']) === 2, 'YouTube muet : dernière liste connue');
check($c2['expires'] - time() > 110 && $c2['expires'] - time() <= 120, 'nouvel essai dans 2 minutes');

$r = yt_latest_videos($ok);
check($r['source'] === 'cache', 'pas de nouvel appel avant les 2 minutes');

array_map('unlink', glob($dir . '/*'));
@rmdir($dir); @rmdir(dirname($dir)); @rmdir($tmp);
echo 'Tous les tests passent.' . PHP_EOL;
