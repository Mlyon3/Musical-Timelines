"""Print every search option per work, to choose overrides."""
import json, pathlib
c = json.loads((pathlib.Path(__file__).parent / "apple_candidates.json").read_text())
for wid, v in c.items():
    print(f"\n{wid} [{v['store']}]")
    for i, o in enumerate(v["options"]):
        print(f"  {i} {o['trackId']} | {o['artistName'][:45]} | {o['trackName'][:95]}")
