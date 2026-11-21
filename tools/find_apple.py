"""Search Apple Music for every library work and record a pick (plus alternatives).
Searches the Japan store first so every pick is playable there; falls back to US
and then checks Japan availability. Writes tools/apple_candidates.json."""
import json, re, sys, time, urllib.parse, urllib.request, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from library_spec import WORKS

OUT = pathlib.Path(__file__).parent / "apple_candidates.json"
BAD = re.compile(r"\barr\b|arr\.|arranged|transcri|version for|for piano trio|for (two )?pianos?\b(?!.*quintet)|orchestrated|bearb|guitar|jazz|lofi|lo-fi|remix|excerpt|karaoke|ringtone|for brass|for organ|for flute|music box|オルゴール", re.I)
done = json.loads(OUT.read_text()) if OUT.exists() else {}

def get(url):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20))
        except Exception as e:
            time.sleep(8 * (i + 1))
    return {"results": []}

def search(term, country):
    q = urllib.parse.urlencode(dict(term=term, media="music", entity="song", limit=50, country=country))
    time.sleep(3.2)
    return get("https://itunes.apple.com/search?" + q)["results"]

def ok(r, w):
    name = r.get("trackName", "")
    if not r.get("previewUrl") or r.get("trackTimeMillis", 0) < 45000: return False
    if BAD.search(name) or BAD.search(r.get("collectionName", "")): return False
    comp = w["composer"][:5].lower()
    blob = (name + " " + r.get("collectionName", "") + " " + r.get("artistName", "")).lower()
    if comp not in blob and w["composer"] != "dvorak": return False
    if w["composer"] == "dvorak" and not re.search(r"dvo", blob): return False
    return all(re.search(m, name, re.I) for m in w["must"])

for w in WORKS:
    if w["reuse"] or w["id"] in done: continue
    picks = [r for r in search(w["query"], "JP") if ok(r, w)]
    store = "JP"
    if not picks:
        picks = [r for r in search(w["query"], "US") if ok(r, w)]
        store = "US"
    done[w["id"]] = dict(store=store, options=[{k: r.get(k) for k in ("trackId", "artistName", "trackName", "collectionName", "previewUrl", "trackViewUrl")} for r in picks[:5]])
    print(f"{len(picks):2d} {store} {w['id']}: " + (picks[0]["artistName"][:40] + " | " + picks[0]["trackName"][:70] if picks else "—"), flush=True)
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1))
