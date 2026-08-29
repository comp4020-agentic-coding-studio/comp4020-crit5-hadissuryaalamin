# Process overview

## What I built

**Keys Breaker** is a four-round, three-lap Bishi Bashi-style arcade gauntlet
on a single `<canvas>`: three racers — you and two rivals — compete on four
fixed pads through Shake the Can, Building Climber, Oh No It's Gonna Explode
and Follow the Rhythm, placing 1st/2nd/3rd each round, with elimination and a
podium. There are no words anywhere except the countdown digits `3, 2, 1`.
Every round has to teach itself from its opening frame.

The interesting part of this week is that I built it twice. The first version
was a solo score-attack game; the client looked at it and said it was the wrong
game — Bishi Bashi is about *racing someone*, and two of my four microgames
weren't the mechanics they had asked for at all. Rounds 3–10 of the build
history are v1. Everything after is the rebuild.

## The moments that mattered

1. **What happened.** Rebuilding the rounds one by one, I kept finding that the
   version I was replacing had never actually run. v1's `drawOhno` had no
   caller. v1's `drawRhythm` had no caller. A correctly written climber module
   was never wired into `main.ts`, so the game kept running a throwaway
   placeholder round instead. All three typechecked, built, and passed the full
   test suite. `pnpm check` was green over every one of them, because
   typecheck + build + vitest cannot see that nothing *calls* a thing — and the
   bundler makes it worse by tree-shaking the dead module out, so the built
   site looks clean while a round is quietly missing.
   **What I did instead of the obvious thing.** Rather than fixing the third
   one and moving on, I stopped and wrote a sensor. `spec/sensor-no-dead-code.test.ts`
   walks the import graph from the entry point named in `index.html` and fails
   on any orphaned module, or any export referenced nowhere at all. It reads
   **source, not `dist/`**, precisely because tree-shaking is what conceals the
   failure. I had to sharpen it once: the first version flagged 13 files, most
   of them symbols merely exported too widely, so I narrowed it to the exact
   shape the real failures had. A sensor that cries wolf gets muted, and then
   it is not a sensor.
   **How I knew it was right.** It caught a live bug on its first run:
   `playTransitionSting` was fully implemented and never called, so the
   transition had been silent — and `main.ts` already had a `TRANSITION_STING_MS`
   constant and a latch that was being set and playing nothing.
   **The citation:**
   [`8d5cd1e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/8d5cd1e).

2. **What happened.** Playtesting Follow the Rhythm surfaced something no test
   would have asked about: doing nothing didn't reliably lose. A player who
   simply never taps can't be eliminated, and the rivals can't be eliminated
   while everyone waits, so a 30-second stall ended with me placed 3rd only
   because neither rival happened to err on the first pattern — about a 30%
   chance. Otherwise the staller wins by default. It was the only one of the
   four rounds where inaction wasn't punished.
   **What I did instead of the obvious thing.** The rule was already marked
   CONFIRMED in the epic, so I did not quietly patch it in code. I took it back
   to the client, who chose to make silence the *same* mistake a wrong pad is
   rather than invent a new consequence — and I recorded that as a dated
   amendment in the epic before any code changed, so the deviation reads as a
   decision rather than drift. In the implementation, the deadline does not get
   an elimination path of its own: the wrong-pad branch was extracted into
   `eliminateRacer`, and the deadline calls that same function, so the drop-out,
   the slump, the placing and the pattern growth are literally one code path
   instead of two that agree today and diverge later.
   **How I knew it was right.** The risk was turning a game with deliberately
   no timing window into a reaction test, so nine of the sixteen tests in
   `spec/rule-echo.test.ts` exist purely to fail if a later edit tightens the
   deadline: at every lap, a competent echo runs clean, a 2.0s worst-case recall
   pause still beats the deadline, and the value is asserted to stay at least
   1.5× that pause. Across 42 competent rounds, zero deadline eliminations.
   **The citation:**
   [`3ab213f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/3ab213f).

3. **What happened.** Spec line 5 asks for one change that came from playing
   the finished game. Every difficulty number in this game had been set against
   *bot* cadence — synthetic tap rates around 7/sec, CPU reaction clocks of
   40–55ms — which is nothing like a thumb. So the human-side difficulty of all
   four rounds was, in truth, unmeasured. Playing Rhythm eight times per lap as
   a competent player making no mistakes, one round in eight **at every lap** ran
   out of clock with two racers still standing and neither having made a single
   mistake, decided by a tiebreak instead of by the elimination rule the whole
   microgame is built on.
   **What I did instead of the obvious thing.** I didn't nudge the number until
   it felt better. The old derivation priced a pattern at "n × 0.6s of echo at a
   rival's reaction speed" — it had never counted the ~0.9s a human spends
   *remembering* the pattern before the first hit, which is the entire
   difference between a CPU and a person. `roundTimeoutSeconds` went 30/32/34 →
   45/48/50, in `laps.ts` only, numbers only, in its own commit.
   **How I knew it was right.** 24 measured rounds before, 18 after. I also
   stated the residual honestly in the commit: a later run produced a 48.9s
   round right on the new valve, and since the round is unbounded in principle
   no finite valve can promise never to interrupt one. The claim is a change of
   kind — 1-in-8 at every lap to 1-in-23 — not elimination. Two earlier
   bot-derived observations were contradicted by real cadence and I trusted the
   play over the note.
   **The citation:**
   [`323bc88`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/323bc88).

4. **What happened.** While playtesting I found that two-human mode had never
   once worked. `input.ts` was correct throughout — it tracked the player slot
   and offered `onSecondPlayerJoin`. `main.ts` took the callback as
   `onPad: (_player, padIndex) => handlePad(padIndex)`, discarding the slot in
   the parameter list, and never passed the join handler at all. Pressing `1`–`4`
   silently added taps for player one. Typecheck, build, all 75 tests **and my
   new dead-code sensor** were green over it for eight tasks.
   **What I did instead of the obvious thing.** The tempting move was to treat
   this as one more bug. Instead I wrote down why my own sensor couldn't see it:
   it catches an *export* nothing references, but here the function was called
   normally and simply dropped what it was handed. A discarded `_`-prefixed
   parameter is the specific shape to distrust, and the check is to grep the
   field, not the function. I put that limitation in `CLAUDE.md` rather than
   leave the sensor looking more capable than it is.
   **How I knew it was right.** Verified with real key events: the human mask
   flips `[t,f,f] → [t,t,f]`, racer 1 gains 2.250 shake against the CPU's 0.100,
   and the seat survives into the next round.
   **The citation:**
   [`439468d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/439468d),
   with the harness note in
   [`77c107c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/77c107c).

5. **What happened.** With the game complete, the client played it and said the
   graphics were trash. They were right, and I could measure why: at desktop
   size each racer rendered roughly 80% black — a heavy ink torso with a thin
   colour sliver inside — so three differently-coloured racers read as three
   identical dark figures, defeating the one thing that distinguishes them.
   Limbs were unoutlined hairlines ending in castor-like dots. The cast was
   frozen in a single closed-eye pose. On a phone, three giant gauge pills took
   ~60% of the screen while the cast was squeezed into a strip.
   **What I did instead of the obvious thing.** Four earlier tasks had each
   patched this locally in their own scene, and each was right locally — nobody
   had fixed the rig, so the defect kept its shape and kept coming back. This
   time the fix was one substitution at the root: a shape's definition stroke is
   a darkened version of **its own fill** rather than ink. That single change
   is what stops a coloured figure reading as a black one, and it fixed every
   scene at once. The client also authorised vendoring CC0 art; I checked the
   sources, found usable public-domain props, and still authored them instead —
   every prop in this game carries a colour the game teaches with (a drum skin
   flashes the struck pad's colour) and is computed from state each frame, and a
   fixed-palette sprite can do neither. That decision is recorded in
   `ATTRIBUTION.md` rather than left implicit.
   **How I knew it was right.** 24 before/after screenshots at 900×700 and
   390×844 across every scene. A racer's colour is now the first thing you
   notice about them.
   **The citation:**
   [`a8afee8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/a8afee8)
   through
   [`c08c6e8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/c08c6e8).

## How the rounds themselves were built

One epic, decomposed into strictly sequential tasks, one agent at a time, with
`pnpm check` green at every boundary — the rounds share a state machine, a
difficulty table and a sound module, so parallel edits would have clobbered each
other. The four v2 rebuilds are
[`74dc78a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/74dc78a) (Climber),
[`3150f4c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/3150f4c) (Oh No, plus its focused rule test),
[`f29147f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/f29147f) (Rhythm),
then [`e60488c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/e60488c) (attract and transitions)
and [`65d16a6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/65d16a6) (audio).
v1's own play-driven tuning fix,
[`aa14e80`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/aa14e80),
survives in history and its numbers still ship.

## Before you ship

`pnpm check:evidence` verifies these citations resolve to real commits in this
repo, that `reflections/crit-5.md` exists, and that `CLAUDE.md` is present.
