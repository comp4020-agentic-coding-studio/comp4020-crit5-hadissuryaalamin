# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.

As you learn what your prototype needs --- a convention the work has to hold to,
a sensor that keeps catching you out, a fact about the stack that is easy to get
wrong --- write it down under "What this prototype has learned" below and wire
it into `check`. Growing this file is the work.

## What this prototype has learned

Facts about this stack that are easy to get wrong, and the sensors that now
catch them. Add to this list rather than re-learning an item the hard way.

### A green `check` does not mean the code runs

`pnpm check` is typecheck + build + vitest. None of the three can see that
nothing *calls* a thing, so all three stay green over code that never executes.
This bit three times in one week, each time discovered only when the round was
being rebuilt:

- v1's Oh No: `drawOhno` had no caller at all. The round on screen was a
  different game from the one in the file.
- v1's Rhythm: `drawRhythm` had no caller either, plus three orphaned sound
  functions describing a deleted rule.
- The climber rewrite: a correct, fully-typed module never wired into
  `main.ts`, so the game kept running the throwaway round it was meant to
  replace.

The bundler makes this worse, not better: it tree-shakes the dead module out,
so the built site looks clean while a round is quietly missing.

**Sensor:** `spec/sensor-no-dead-code.test.ts` walks the import graph from the
entry point named in `index.html` and fails on (a) any module under `src/`
orphaned from it, and (b) any exported symbol referenced nowhere at all —
including inside its own file. It reads **source, not `dist/`**, because
tree-shaking is exactly what hides the failure. It deliberately ignores symbols
used only within their own file: that is over-exporting, not a missing round,
and a sensor that cries wolf gets muted.

It earned itself on its first run, catching `playTransitionSting` — a fully
implemented transition sound that nothing called, so the transition was silent.

### Screenshots catch what every automated check misses

Every task this week that rendered anything shipped a defect that typecheck,
build and vitest were all green through, and that only a screenshot exposed:
characters drawn as black blobs on a near-black palette (a background at
~1.1:1 against `INK`); a prop covering the character's face; an explosion
drawn *behind* the cast; a scene stranded tiny at phone size; figures rendering
as near-solid ink because rig strokes scaled from the wrong unit.

Look at the rendered page at **both** 900x700 and 390x844 before believing any
visual work is done. This is not a substitute for a sensor — it is the part no
sensor covers.

### Anything that must be *seen* needs an explicit hold

Terminal moments resolve the state machine on the same frame they fire, so they
draw for zero frames unless held. The explosion needed 750ms; the elimination
slump needed 900ms. If a visual moment carries meaning, give it a duration and
verify it on screen — the logic being correct is not the same as the player
seeing it.

### A feature can be finished on one side of a boundary and never connected

Two-human mode had never once worked. `input.ts` was correct throughout: it
tracked the player slot and offered `onSecondPlayerJoin`. `main.ts` took the
callback as `onPad: (_player, padIndex) => handlePad(padIndex)` — the slot
discarded in the parameter list — and never passed the join handler at all.
Pressing `1`-`4` silently added taps for player one. Typecheck, build, the
whole suite and the dead-code sensor were all green over a completely dead
feature for eight tasks.

**This is the sensor's blind spot, and it is worth knowing precisely.**
`spec/sensor-no-dead-code.test.ts` catches an *export* that nothing references.
It cannot see a parameter that is accepted and dropped, or an interface field
nobody supplies, because the function around it is called normally. A discarded
`_`-prefixed parameter on a callback is the specific shape to distrust: it is
the compiler being told to stop asking. When a module offers a capability,
check the caller actually consumes it — grep the field name, not the function
name.

### Rig strokes must scale from the scene's own unit

Four separate tasks have now independently re-derived this. `strokeWeight` has
a 4px floor and a 1.2x multiplier sized for the stage unit `u`, and limb blobs
are `2.2 * u`. Any scene drawing characters at a smaller unit than the stage —
a transition card, a phone viewport, a cast of three side by side — gets the
stroke clamped to 16px, which fills the blob solid: characters render as black
flowers or near-solid ink. The fix each time was the same, a scene-local unit
plus `fittedBlobScale`.

It is the single most repeated defect of the week, it is invisible to every
automated check, and it only ever showed up in a screenshot at 390x844.
