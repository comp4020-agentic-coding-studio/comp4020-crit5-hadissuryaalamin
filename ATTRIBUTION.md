# Attribution

## Third-party artwork: none

**This prototype vendors no third-party artwork.** Every mark on the canvas is
drawn by code in `src/render/`, authored in this repo.

Epic section 8's 2026-08-29 amendment relaxed the original "no raster artwork"
rule to permit CC0 / public-domain vector props committed into the repo, so
sourcing art was allowed here and was genuinely evaluated. Both reliable
sources named in the brief were checked: kenney.nl (CC0) and openclipart
(public domain, which does return usable cartoon-bomb results). Availability
was not the blocker. Three properties of this particular game were:

1. **Every prop carries a colour that the game uses to teach itself.** The can
   wears its racer's colour on its label, the drum shell wears its racer's
   colour and its skin flashes the colour of the pad that was just struck, the
   game master's cymbals and tunic wear whichever pad colour is currently
   sounding, and the glow ring over a climber's head wears the pad they owe
   next. There are no words anywhere in this game; colour is the entire
   teaching mechanism, and it has to survive muting and colourblind play. A
   fixed-palette sprite cannot carry four different hues on demand.

2. **Every prop is animated procedurally, from game state.** The bomb's fuse
   is drawn to `fuseRemaining / fuseSeconds` along a bezier with the spark
   sitting on the burning end, so the round's whole clock is one object. The
   can rotates a beat behind the body that is shaking it and launches to a
   height set by that racer's gauge. The tower scrolls per floor with absolute,
   non-repeating storeys. None of these is a sprite that could be swapped in;
   they are shapes computed each frame.

3. **The whole game now shares one lighting model** — a key from the upper
   left, shading toward `PAPER`, falling toward `INK`, with outline used
   sparingly for definition (`src/render/draw.ts`). A sourced asset arrives
   with its own light direction, its own outline weight and its own palette,
   and would read as pasted on.

The task's own rule settles it: "if no good CC0 match exists for a prop,
author it — a mediocre sourced asset is worse than a good drawn one." What was
authored instead, in this pass: an aluminium can with a shaded barrel, a
coloured label band, rolled rims and a pull tab; a cast-iron bomb with a rim
light and a brass cap; a concrete tower with a lit face and recessed storey
lines; hammered-brass cymbals; lacquered drums with a stretched skin and a
tension hoop; cloth bunting; a domed arcade button seated in a bezel; and four
pads modelled as physical arcade buttons.

If a future pass does vendor an asset, add it to a table here — file path,
source URL, author, licence — and keep it off the game canvas, which stays
wordless.

## Fonts and other dependencies

The countdown digits use a system font stack (`Arial Black` / `Helvetica Neue`
/ Impact / `system-ui`); no webfont is bundled or fetched.

`public/card.png` is the link-preview card that ships with the course starter
repo.
