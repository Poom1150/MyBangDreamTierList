# Character pictures for the ID card

The `.webp` files that appear in this folder are made by `build_character_art.py` from the pictures you save in the `character_art/` folder.
Do not edit them by hand: run the script again instead.

**They are not published by default.** `.gitignore` keeps `character_art/`, these `.webp` files and `data/character-art.json` on your computer,
so the pictures show on the card when you open the site locally (`python -m http.server`), while the public site shows the star mascot.
To publish the pictures too, delete the four ignore lines in `.gitignore`, run the script, then commit and push. They are official artwork
(© Bushiroad / BanG Dream! Project), so publishing them is your decision.

## Adding pictures
1. Save your pictures in `character_art/<band folder>/`, for example
   `character_art/AfterGlow/BanG_Dream!_10th_Anniversary_Himari.png`.
   The band folder can be spelled any way that is recognisable (`AfterGlow`, `Poppin'Party`, `Hello_Happy_World`, ...).
2. Name each file with the character's given name (a family name or the stage name, such as `Layer`, also works).
3. Run `python build_character_art.py`. It trims the empty margins, saves a web-sized copy here as `<character id>.webp`
   and lists it in `data/character-art.json`, which is what the ID card page reads.

## Which picture a character gets
1. A file with `10th_Anniversary` in its name (preferred).
2. Otherwise a file with `Our_Notes` in its name (an outfit called `Casual` is used only if nothing else exists).
3. Otherwise any other file named after the character.

Characters without a picture show a star mascot in their color.
The script prints what it used and lists any file it could not match to a character.
