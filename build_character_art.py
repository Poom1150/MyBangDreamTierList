"""Matches the pictures you saved in character_art/ to the characters and prepares them for the ID card.

Put your own files in character_art/<band folder>/..., named with the character's given name, for example
    character_art/AfterGlow/BanG_Dream!_10th_Anniversary_Himari.png     (preferred)
    character_art/Roselia/BanG_Dream!_Our_Notes_Yukina.png              (used for characters with no 10th Anniversary file)
When a character has both, the 10th Anniversary picture wins. Any other file named with the character's name is used last.

Run `python build_character_art.py` after adding or changing files. For every picture it can match it:
  * writes a web-sized WebP copy to assets/characters/<character id>.webp (transparent margins trimmed), and
  * lists it in data/character-art.json, which is what the ID card page reads.
The files in character_art/ themselves are never changed.
"""
import json
import os
import re
import sys
import unicodedata

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'character_art')
OUT = os.path.join(ROOT, 'assets', 'characters')
MAX_HEIGHT = 760  # the card draws the picture about 650 px tall

characters = json.load(open(os.path.join(ROOT, 'data', 'characters.json'), encoding='utf-8'))
bands = json.load(open(os.path.join(ROOT, 'data', 'bands.json'), encoding='utf-8'))


def key(text):
    """lower-case letters and digits only, so 'Poppin'Party', 'POPPIN_PARTY' and 'poppinparty' all match"""
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '', text)


# folder name -> band id (any spelling of the band's name or id works)
band_of_folder = {}
for b in bands:
    band_of_folder[key(b['id'])] = b['id']
    band_of_folder[key(b['name'])] = b['id']
band_of_folder.update({
    'popipa': 'popipa', 'pasupare': 'pasupare', 'pastelpalettes': 'pasupare', 'pastelpallettes': 'pasupare',
    'harohapi': 'harohapi', 'hhw': 'harohapi', 'helloHappyWorld'.lower(): 'harohapi',
    'raiseasuilen': 'ras', 'ras': 'ras', 'yumemita': 'mewtype', 'mugendaimewtype': 'mewtype',
})

# other names a picture's file may use for a character
ALIASES = {
    # RAISE A SUILEN members are listed by stage name, but their pictures are often named after the member
    'ras-layer': {'rei', 'wakanarei'},
    'ras-lock': {'rokka', 'asahirokka'},
    'ras-masking': {'masuki', 'satoumasuki'},
    'ras-pareo': {'reona', 'nyubarareona'},
    'ras-chu2': {'chiyu', 'tamadechiyu', 'chu2', 'chuchu'},
}


def names_of(char):
    """the spellings a file name may use for this character: given name, family name, the whole name, or an alias"""
    parts = char['name'].split()
    found = {key(char['name']), key(parts[-1]), key(parts[0])} | ALIASES.get(char['id'], set())
    return {f for f in found if f}


def classify(filename):
    """returns (priority, name part): 10th Anniversary art first, then BanG Dream! Our Notes art, then anything else"""
    stem = os.path.splitext(filename)[0]
    if re.search(r'10th[\W_]*anniversary', stem, re.I):
        return 0, re.sub(r'^.*?10th[\W_]*anniversary[\W_]*', '', stem, flags=re.I), '10th Anniversary'
    if re.search(r'our[\W_]*notes', stem, re.I):
        rest = re.sub(r'^.*?our[\W_]*notes[\W_]*', '', stem, flags=re.I)
        # a "casual" outfit is only used when nothing better exists
        return (2 if re.search(r'casual', rest, re.I) else 1), re.sub(r'casual', '', rest, flags=re.I), 'Our Notes'
    return 3, stem, 'other'


best, problems = {}, []  # character id -> (priority, kind, path)
if not os.path.isdir(SRC):
    sys.exit(f'No folder named character_art/ found next to this script: {SRC}')

for folder, _dirs, files in sorted(os.walk(SRC)):
    band = band_of_folder.get(key(os.path.basename(folder)))
    for name in sorted(files):
        if not name.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
            continue
        path = os.path.join(folder, name)
        priority, namepart, kind = classify(name)
        tokens = [t for t in re.split(r'[\W_]+', namepart) if t]
        wanted = {key(namepart)} | {key(t) for t in tokens}
        pool = [c for c in characters if band is None or c['band'] == band]
        hits = [c for c in pool if wanted & names_of(c)]
        if len(hits) != 1:
            problems.append((os.path.relpath(path, ROOT), 'no match' if not hits else 'matches several: ' + ', '.join(c['name'] for c in hits)))
            continue
        char = hits[0]
        current = best.get(char['id'])
        if current is None or priority < current[0]:
            if current is not None:
                problems.append((current[2], f"{char['name']} uses a better picture instead ({os.path.relpath(path, ROOT)})"))
            best[char['id']] = (priority, kind, os.path.relpath(path, ROOT))
        else:
            problems.append((os.path.relpath(path, ROOT), f"{char['name']} already uses {current[2]}"))

matched = {}
for cid, (_priority, _kind, rel) in best.items():
    matched[cid] = rel
    image = Image.open(os.path.join(ROOT, rel)).convert('RGBA')
    box = image.getchannel('A').getbbox()  # trim the empty transparent margins
    if box:
        image = image.crop(box)
    if image.height > MAX_HEIGHT:
        image = image.resize((round(image.width * MAX_HEIGHT / image.height), MAX_HEIGHT), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    image.save(os.path.join(OUT, f'{cid}.webp'), 'WEBP', quality=86, method=6)

# forget pictures whose source file was removed
for old in os.listdir(OUT) if os.path.isdir(OUT) else []:
    if old.endswith('.webp') and old[:-5] not in matched:
        os.remove(os.path.join(OUT, old))

manifest = {cid: f'assets/characters/{cid}.webp' for cid in matched}
json.dump(manifest, open(os.path.join(ROOT, 'data', 'character-art.json'), 'w', encoding='utf-8'), indent=1)

by_band = {}
for c in characters:
    entry = by_band.setdefault(c['band'], {'total': 0, 'kinds': {}})
    entry['total'] += 1
    if c['id'] in best:
        kind = best[c['id']][1]
        entry['kinds'][kind] = entry['kinds'].get(kind, 0) + 1
print(f'{len(matched)} of {len(characters)} characters have a picture.')
for b in bands:
    entry = by_band.get(b['id'])
    if entry and entry['kinds']:
        detail = ', '.join(f'{n} x {k}' for k, n in entry['kinds'].items())
        print(f"  {b['name']}: {sum(entry['kinds'].values())} / {entry['total']} ({detail})")
# a checklist of the characters that still need a picture, with the file name that will be recognised
def given(char):
    parts = char['name'].split()
    return unicodedata.normalize('NFKD', parts[-1]).encode('ascii', 'ignore').decode() or parts[-1]


lines = ['Characters that still have no picture (they show a star mascot).', '',
         'Save a picture for each one in character_art/<band folder>/ using either file name, then run:  python build_character_art.py',
         '  BanG_Dream!_10th_Anniversary_<Name>.png   (preferred)',
         '  BanG_Dream!_Our_Notes_<Name>.png          (used when there is no 10th Anniversary picture)', '']
for b in bands:
    todo = [c for c in characters if c['band'] == b['id'] and c['id'] not in matched]
    if todo:
        lines.append(f"{b['name']}  ->  folder: character_art/{b['name']}/   ({len(todo)} of {sum(1 for c in characters if c['band'] == b['id'])} missing)")
        lines += [f"    {c['name']:<20} <Name> = {given(c)}" for c in todo]
        lines.append('')
open(os.path.join(SRC, 'MISSING.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
print(f"A checklist of the {len(characters) - len(matched)} characters without a picture is in character_art/MISSING.txt")

missing = [b['name'] for b in bands if b['id'] in by_band and not by_band[b['id']]['kinds']]
if missing:
    print('  no pictures yet (these use the star mascot):', ', '.join(missing))
for path, why in problems:
    print(f'  NOT USED: {path} ({why})')
