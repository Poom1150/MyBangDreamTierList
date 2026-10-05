"""Build data/bands.json and data/songs.json from covers/index.csv."""
import csv
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(ROOT, 'covers', 'index.csv'), encoding='utf-8-sig')))

# name, id, color, icon, monogram
BANDS = [
    ("Poppin'Party", "popipa", "#ff3377", "assets/bands/band_1.svg", "PP"),
    ("Afterglow", "afterglow", "#e23344", "assets/bands/band_2.svg", "AG"),
    ("Pastel Palettes", "pasupare", "#33ddaa", "assets/bands/band_4.svg", "PP"),
    ("Roselia", "roselia", "#3344aa", "assets/bands/band_5.svg", "R"),
    ("Hello, Happy World!", "harohapi", "#ffcc11", "assets/bands/band_3.svg", "HHW"),
    ("Morfonica", "morfonica", "#33aaff", "assets/bands/band_21.svg", "M"),
    ("RAISE A SUILEN", "ras", "#22cccc", "assets/bands/band_18.svg", "RAS"),
    ("MyGO!!!!!", "mygo", "#3388bb", "assets/bands/band_45.svg", "MyGO"),
    ("Ave Mujica", "ave", "#881144", "", "AM"),
    ("Mugendai Mewtype", "mewtype", "#ee6699", "", "MM"),
    ("Ikka Dumb Rock!", "ikka", "#ff9933", "", "IDR"),
    ("millsage", "millsage", "#99aa55", "", "ms"),
    ("Glitter Green", "glitter", "#44cc66", "", "GG"),
    ("CRYCHIC", "crychic", "#7788aa", "", "CR"),
    ("sumimi", "sumimi", "#cc88cc", "", "sm"),
    ("CHiSPA", "chispa", "#bb7744", "", "CH"),
    ("Other & Collaborations", "other", "#aa99dd", "", "★"),
]
bands = [{"name": n, "id": i, "color": c, "icon": ic, "mono": m} for n, i, c, ic, m in BANDS]
band_id = {b[0]: b[1] for b in BANDS}

songs, seen = [], set()
for r in rows:
    rel = r['file'].replace(chr(92), '/')
    if not os.path.exists(os.path.join(ROOT, 'covers', rel)):
        print('MISSING', rel)
        continue
    sid = re.sub(r'[^a-z0-9]+', '-', (r['band'] + '-' + r['title_en']).lower()).strip('-')[:60]
    base, k = sid, 2
    while sid in seen:
        sid = f'{base}-{k}'
        k += 1
    seen.add(sid)
    songs.append({
        "id": sid,
        "title": r['title_en'],
        "jp": r['title_jp'],
        "band": band_id[r['band']],
        "variant": r['kind'] == 'variant',
        "file": 'covers/' + rel,
    })

os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
json.dump(bands, open(os.path.join(ROOT, 'data', 'bands.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(songs, open(os.path.join(ROOT, 'data', 'songs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(songs), 'songs', len(bands), 'bands')
