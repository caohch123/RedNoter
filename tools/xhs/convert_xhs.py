"""Convert MediaCrawler JSON results to the current RedNoter import format."""
import json
import re
import sys
import hashlib
from urllib.parse import urlparse
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MEDIA_ROOT = PROJECT_ROOT / "web" / "public" / "imported-media"

def clean_content(text):
    return re.sub(r"#[^#\r\n]+?\[话题\]#", "", text).strip()

def download_images(row):
    urls = row.get("image_list") or []
    if isinstance(urls, str):
        urls = urls.split(",")
    paths = []
    for url in dict.fromkeys(urls):
        if not isinstance(url, str) or not url.strip():
            continue
        url = url.strip()
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not (parsed.hostname or "").endswith(".xhscdn.com"):
            continue
        url = "https://" + url.split("://", 1)[1]
        name = hashlib.sha256(url.encode()).hexdigest()[:24]
        cached = list(MEDIA_ROOT.glob(name + ".*")) if MEDIA_ROOT.exists() else []
        if cached:
            paths.append("/imported-media/" + cached[0].name)
            continue
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.xiaohongshu.com/"})
            with urllib.request.urlopen(request, timeout=25) as response:
                kind = response.headers.get_content_type()
                extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif"}.get(kind)
                if extension is None:
                    raise ValueError("unsupported image type")
                data = response.read(20 * 1024 * 1024 + 1)
                if len(data) > 20 * 1024 * 1024:
                    raise ValueError("image exceeds 20 MB")
            MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
            path = MEDIA_ROOT / (name + extension)
            path.write_bytes(data)
            paths.append("/imported-media/" + path.name)
        except Exception as error:
            print("Image download failed:", type(error).__name__, str(error), flush=True)
    return paths

def likes(value):
    text = str(value or "0").replace(",", "").replace("+", "").strip()
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([万千wWkK]?)", text)
    if not match:
        raise ValueError("Unrecognized like count")
    factor = {"万": 10000, "w": 10000, "W": 10000, "千": 1000, "k": 1000, "K": 1000}.get(match[2], 1)
    return int(float(match[1]) * factor)

def convert(source, output, limit=5):
    if not 1 <= limit <= 100:
        raise ValueError("Count must be between 1 and 100")
    result = {}
    skipped = 0
    for file in sorted(Path(source).rglob("*contents*.json")):
        rows = json.loads(file.read_text(encoding="utf-8-sig"))
        for row in rows:
            if len(result) >= limit:
                break
            if not row.get("note_id"):
                skipped += 1
                continue
            try:
                post = {"id": "xhs-" + str(row["note_id"]), "title": row.get("title") or str(row.get("desc", ""))[:80] or "无标题",
                        "author": row.get("nickname") or "作者未提供", "content": clean_content(str(row.get("desc", ""))),
                        "tags": [tag.strip() for tag in str(row.get("tag_list", "")).split(",") if tag.strip()],
                        "images": download_images(row),
                        "likes": likes(row.get("liked_count"))}
                result[post["id"]] = post
            except ValueError:
                skipped += 1
    if not result:
        raise SystemExit("No usable posts were collected. No import file written.")
    Path(output).write_text(json.dumps(list(result.values())[:limit], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Converted {min(len(result), limit)} posts; skipped {skipped}. Output: {output}")

if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5)
