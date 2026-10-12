<?php
/**
 * Lecture du flux RSS public d'une chaîne YouTube, avec cache fichier.
 * Aucune clé API, aucun quota. Voir server/README.md.
 */
declare(strict_types=1);

const YT_CHANNEL_ID   = 'UCjnx--E5SwGATKxySKTAadA';
const YT_MAX_VIDEOS   = 5;
const YT_CACHE_TTL    = 600; // 10 minutes
const YT_RETRY_DELAY  = 120; // 2 minutes après un échec
const YT_HTTP_TIMEOUT = 8;

const YT_NS = [
    'atom'  => 'http://www.w3.org/2005/Atom',
    'yt'    => 'http://www.youtube.com/xml/schemas/2015',
    'media' => 'http://search.yahoo.com/mrss/',
];

/** Dossier du cache, toujours hors du dossier public. */
function yt_cache_dir(): ?string
{
    $docRoot = isset($_SERVER['DOCUMENT_ROOT']) ? realpath((string) $_SERVER['DOCUMENT_ROOT']) : false;
    $candidates = [];
    $home = getenv('HOME');
    if ($home) {
        $candidates[] = rtrim($home, '/') . '/.cache/abrahamandebi';
    }
    if ($docRoot) {
        // /home/<user>/domains/<domaine>/public_html -> /home/<user>
        $candidates[] = dirname($docRoot, 3) . '/.cache/abrahamandebi';
    }
    $candidates[] = rtrim(sys_get_temp_dir(), '/') . '/abrahamandebi-cache';

    foreach ($candidates as $dir) {
        if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
            continue;
        }
        $real = realpath($dir);
        if ($real === false || !is_writable($real)) {
            continue;
        }
        if ($docRoot && strpos($real . '/', $docRoot . '/') === 0) {
            continue; // jamais dans le dossier public
        }
        return $real;
    }
    return null;
}

function yt_read_cache(string $file): ?array
{
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) @file_get_contents($file), true);
    if (!is_array($data) || !isset($data['videos'], $data['expires']) || !is_array($data['videos'])) {
        return null;
    }
    return $data;
}

function yt_write_cache(string $file, array $data): void
{
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) {
        @rename($tmp, $file);
    }
}

/** Télécharge le flux. Renvoie le XML, ou null en cas d'échec. */
function yt_download(string $url): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT        => YT_HTTP_TIMEOUT,
            CURLOPT_USERAGENT      => 'abrahamandebi.com (flux YouTube)',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($code === 200 && is_string($body) && $body !== '') ? $body : null;
    }

    $ctx = stream_context_create(['http' => [
        'timeout'       => YT_HTTP_TIMEOUT,
        'user_agent'    => 'abrahamandebi.com (flux YouTube)',
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    $status = isset($http_response_header[0]) ? $http_response_header[0] : '';
    return (is_string($body) && $body !== '' && preg_match('#\s200\s#', $status)) ? $body : null;
}

/**
 * Extrait les vidéos du flux : videoId, title, published, views.
 * Écarte les Shorts et les titres en double, garde les plus récentes.
 */
function yt_parse_feed(string $xml, int $max = YT_MAX_VIDEOS): ?array
{
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $doc->loadXML($xml, LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if (!$ok) {
        return null;
    }

    $xp = new DOMXPath($doc);
    foreach (YT_NS as $prefix => $uri) {
        $xp->registerNamespace($prefix, $uri);
    }

    $videos = [];
    $seenTitles = [];
    foreach ($xp->query('/atom:feed/atom:entry') as $entry) {
        $id        = trim($xp->evaluate('string(yt:videoId)', $entry));
        $title     = trim($xp->evaluate('string(atom:title)', $entry));
        $published = trim($xp->evaluate('string(atom:published)', $entry));
        $link      = trim($xp->evaluate('string(atom:link[@rel="alternate"]/@href)', $entry));
        $views     = trim($xp->evaluate('string(media:group/media:community/media:statistics/@views)', $entry));

        if (!preg_match('/^[A-Za-z0-9_-]{11}$/', $id) || $title === '') {
            continue;
        }
        if (strpos($link, '/shorts/') !== false) {
            continue;
        }
        $key = preg_replace('/\s+/u', ' ', $title);
        $key = function_exists('mb_strtolower') ? mb_strtolower($key, 'UTF-8') : strtolower($key);
        if (isset($seenTitles[$key])) {
            continue;
        }
        $seenTitles[$key] = true;

        $videos[] = [
            'videoId'   => $id,
            'title'     => $title,
            'published' => $published,
            'views'     => ctype_digit($views) ? (int) $views : null,
        ];
    }

    usort($videos, static function (array $a, array $b): int {
        return strcmp($b['published'], $a['published']);
    });

    return array_slice($videos, 0, $max);
}

/**
 * Renvoie ['videos' => [...], 'updated' => ts, 'source' => 'cache'|'live'|'stale'],
 * ou null si aucune liste n'est disponible.
 * $download permet de remplacer le téléchargement (tests).
 */
function yt_latest_videos(?callable $download = null): ?array
{
    $download = $download ?: 'yt_download';
    $dir = yt_cache_dir();
    $file = $dir ? $dir . '/youtube-' . YT_CHANNEL_ID . '.json' : null;
    $now = time();

    $cache = $file ? yt_read_cache($file) : null;
    if ($cache && $now < (int) $cache['expires']) {
        return ['videos' => $cache['videos'], 'updated' => (int) ($cache['updated'] ?? $now), 'source' => 'cache'];
    }

    // Un seul rafraîchissement à la fois.
    $lock = $file ? @fopen($file . '.lock', 'c') : false;
    if ($lock) {
        flock($lock, LOCK_EX);
        $fresh = yt_read_cache($file);
        if ($fresh && $now < (int) $fresh['expires']) {
            flock($lock, LOCK_UN);
            fclose($lock);
            return ['videos' => $fresh['videos'], 'updated' => (int) ($fresh['updated'] ?? $now), 'source' => 'cache'];
        }
    }

    $xml = $download('https://www.youtube.com/feeds/videos.xml?channel_id=' . YT_CHANNEL_ID);
    $videos = $xml !== null ? yt_parse_feed($xml) : null;

    $result = null;
    if ($videos) {
        $result = ['videos' => $videos, 'updated' => $now, 'source' => 'live'];
        if ($file) {
            yt_write_cache($file, ['videos' => $videos, 'updated' => $now, 'expires' => $now + YT_CACHE_TTL]);
        }
    } elseif ($cache) {
        // YouTube ne répond pas : dernière liste connue, nouvel essai dans 2 minutes.
        $result = ['videos' => $cache['videos'], 'updated' => (int) ($cache['updated'] ?? $now), 'source' => 'stale'];
        yt_write_cache($file, ['videos' => $cache['videos'], 'updated' => $result['updated'], 'expires' => $now + YT_RETRY_DELAY]);
    }

    if ($lock) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
    return $result;
}
