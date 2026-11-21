"""Build site/catalog-library.js from the spec, Apple picks and overrides.

- tools/apple_candidates.json : search results per work (from find_apple.py)
- tools/apple_overrides.json  : {work_id: trackId} manual choices
- Orchestral Beethoven/Brahms works reuse site/catalog-orchestral.js
Every chosen track is checked in the Japan store; credits come from the US
store when available (English performer names)."""
import json, pathlib, re, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from library_spec import COMPOSERS, WORKS, EVENTS

cands = json.loads((ROOT / "tools/apple_candidates.json").read_text())
ovr_path = ROOT / "tools/apple_overrides.json"
overrides = json.loads(ovr_path.read_text()) if ovr_path.exists() else {}
orch_src = (ROOT / "site/catalog-orchestral.js").read_text()
orch = json.loads(orch_src[orch_src.index("{"):orch_src.rindex("}") + 1])


# English credits for tracks only listed in the Japan store.
EN_NAMES = {
    "エベーヌ四重奏団": "Quatuor Ébène", "フィリップ・カサール": "Philippe Cassard", "マルタ・アルゲリッチ": "Martha Argerich",
    "ウラディミール・ホロヴィッツ": "Vladimir Horowitz", "アルトゥール・ルービンシュタイン": "Arthur Rubinstein",
    "エマーソン弦楽四重奏団": "Emerson String Quartet",
}
def english(name):
    for ja, en in EN_NAMES.items():
        name = name.replace(ja, en)
    return name


def lookup(ids, country):
    out = {}
    ids = list(ids)
    for i in range(0, len(ids), 50):
        url = f"https://itunes.apple.com/lookup?country={country}&id=" + ",".join(map(str, ids[i:i + 50]))
        for attempt in range(4):
            try:
                data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))
                break
            except Exception:
                time.sleep(8 * (attempt + 1))
        else:
            raise SystemExit("lookup failed")
        out.update({r["trackId"]: r for r in data["results"] if r.get("wrapperType") == "track"})
        time.sleep(3)
    return out


chosen = {}
for w in WORKS:
    if w["reuse"]:
        continue
    if w["id"] in overrides:
        chosen[w["id"]] = int(overrides[w["id"]])
    else:
        opts = cands.get(w["id"], {}).get("options", [])
        if not opts:
            print("NO RECORDING:", w["id"]); continue
        chosen[w["id"]] = opts[0]["trackId"]

jp = lookup(chosen.values(), "JP")
us = lookup(chosen.values(), "US")
missing_jp = [wid for wid, t in chosen.items() if not jp.get(t, {}).get("previewUrl")]
if missing_jp:
    print("NOT PLAYABLE IN JAPAN:", missing_jp)

works, excerpts = [], []
for w in WORKS:
    if w["reuse"]:
        ow = next(x for x in orch["works"] if x["id"] == w["reuse"])
        oe = next(x for x in orch["excerpts"] if x["workId"] == w["reuse"])
        works.append(dict(id=w["id"], composerId=w["composer"], ensemble="orchestral", year=ow["year"], title=ow["title"],
                          catalogue=ow["catalogue"], chapter=ow["chapter"], story=ow["story"], source=ow["source"], sourceLabel=ow["sourceLabel"]))
        e = {k: v for k, v in oe.items()}
        e.update(id=w["id"] + "-a", workId=w["id"])
        excerpts.append(e)
        continue
    t = chosen.get(w["id"])
    if not t or w["id"] in missing_jp:
        continue
    j, u = jp[t], us.get(t)
    credit = u or j
    view = (u or j)["trackViewUrl"].split("?")[0] + "?i=" + str(t) if "?i=" not in (u or j)["trackViewUrl"] else (u or j)["trackViewUrl"]
    works.append(dict(id=w["id"], composerId=w["composer"], ensemble=w["ensemble"], year=w["year"], title=w["title"],
                      catalogue=w["catalogue"], chapter=w["chapter"], story=w["story"], source=view,
                      sourceLabel="Apple Music · " + credit["collectionName"]))
    excerpts.append(dict(id=w["id"] + "-a", version=1, workId=w["id"], family=w["ensemble"], subtitle=w["subtitle"],
                         provider="apple", appleId=t, audioPath=(u or j)["previewUrl"], trackViewUrl=view,
                         performer=english(credit["artistName"]), album=credit["collectionName"], license="Preview courtesy of Apple Music",
                         licenseUrl=view, sourcePage=view, audioSource=(u or j)["previewUrl"], clipLicense="Apple Music preview",
                         modifications="30-second preview supplied by Apple Music; the game plays the first 25 seconds.",
                         checked=time.strftime("%Y-%m-%d"), excerptStart=0, excerptDuration=25))

for ev in EVENTS:
    works.append(dict(id=ev["id"], kind="event", region=ev["region"], year=ev["year"], title=ev["title"], story=ev["what"],
                      titleJa=ev.get("title_ja"), storyJa=ev.get("what_ja"), catalogue="", chapter=""))
    excerpts.append(dict(id=ev["id"], version=1, workId=ev["id"], family="event", provider="event", subtitle="Historical moment"))

cat = dict(version="library-1", composers=[dict(id=i, name=n, fullName=f) for i, n, f in COMPOSERS], works=works, excerpts=excerpts)
(ROOT / "site/catalog-library.js").write_text("window.CATALOG_LIB=" + json.dumps(cat, ensure_ascii=False, separators=(",", ":")) + ";\n")
music = [x for x in works if x.get("kind") != "event"]
print(f"{len(music)} works, {len(EVENTS)} moments written")
