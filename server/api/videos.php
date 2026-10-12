<?php
/**
 * GET /api/videos.php
 * Les dernières vidéos de la chaîne YouTube, en JSON. Voir server/README.md.
 */
declare(strict_types=1);

require __DIR__ . '/lib/youtube-feed.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$data = yt_latest_videos();

if ($data === null) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('Retry-After: ' . YT_RETRY_DELAY);
    echo json_encode(['error' => 'Liste des vidéos indisponible pour le moment.'], JSON_UNESCAPED_UNICODE);
    exit;
}

header('Cache-Control: public, max-age=300');
header('X-Videos-Source: ' . $data['source']);

echo json_encode([
    'channelId' => YT_CHANNEL_ID,
    'updated'   => gmdate('c', $data['updated']),
    'videos'    => $data['videos'],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
