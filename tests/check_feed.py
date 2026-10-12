"""
Vérifie la lecture du flux YouTube avec les mêmes expressions XPath que
server/api/lib/youtube-feed.php (PHP n'est pas nécessaire en local).

Usage : python tests/check_feed.py [fichier.xml]
Sans argument, le vrai flux de la chaîne est téléchargé.
"""
import re
import sys
import urllib.request

from lxml import etree

CHANNEL_ID = "UCjnx--E5SwGATKxySKTAadA"
MAX_VIDEOS = 5
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}


def parse_feed(xml: bytes, max_videos: int = MAX_VIDEOS):
    root = etree.fromstring(xml, parser=etree.XMLParser(no_network=True, resolve_entities=False))
    videos, seen = [], set()
    for entry in root.xpath("/atom:feed/atom:entry", namespaces=NS):
        def s(expr):
            return str(entry.xpath(expr, namespaces=NS)).strip()

        vid = s("string(yt:videoId)")
        title = s("string(atom:title)")
        published = s("string(atom:published)")
        link = s('string(atom:link[@rel="alternate"]/@href)')
        views = s("string(media:group/media:community/media:statistics/@views)")

        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid) or not title:
            continue
        if "/shorts/" in link:
            continue
        key = re.sub(r"\s+", " ", title).lower()
        if key in seen:
            continue
        seen.add(key)
        videos.append({"videoId": vid, "title": title, "published": published,
                       "views": int(views) if views.isdigit() else None})
    videos.sort(key=lambda v: v["published"], reverse=True)
    return videos[:max_videos]


SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
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
</feed>"""


def main():
    # 1. Règles sur un flux d'exemple : Shorts et doublons écartés, tri du plus récent.
    sample = parse_feed(SAMPLE)
    assert [v["videoId"] for v in sample] == ["DDDDDDDDDDD", "AAAAAAAAAAA"], sample
    assert sample[0]["title"] == "Message <D> & co"
    assert sample[1]["views"] == 1250 and sample[0]["views"] is None
    print("exemple   ok (Shorts et doublons écartés, tri, vues)")

    # 2. Le vrai flux.
    if len(sys.argv) > 1:
        xml = open(sys.argv[1], "rb").read()
    else:
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
        xml = urllib.request.urlopen(url, timeout=15).read()
    root = etree.fromstring(xml)
    total = len(root.xpath("/atom:feed/atom:entry", namespaces=NS))
    videos = parse_feed(xml)
    assert videos, "aucune vidéo lue dans le vrai flux"
    for v in videos:
        assert v["published"], v
        assert v["views"] is not None, v
    print(f"vrai flux ok : {total} entrées, {len(videos)} retenues")
    for v in videos:
        print(f"  {v['published'][:10]}  {v['views']:>6} vues  {v['videoId']}  {v['title']}")


if __name__ == "__main__":
    main()
