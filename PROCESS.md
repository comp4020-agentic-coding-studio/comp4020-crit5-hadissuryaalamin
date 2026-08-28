# Process overview

## What I built

**Keys Breaker** is a four-round, three-lap Bishi Bashi-style arcade gauntlet
built entirely on a single `<canvas>`: tap-driven microgames (Oh No's balloon,
Shake's can, Climber's alternating pads, Rhythm's bouncing ball) strung
together by a hard-cut transition routine, with zero on-screen words anywhere
except the countdown digits `3, 2, 1`. The idea behind it is that the screen
itself has to teach the rules — every round's opening frame is designed so the
first tap is discoverable by looking, not by reading.

## The moments that mattered

1. **What happened.** The epic (`.claude/epics/crit5-game/epic.md`) specified
   a tightly-coupled architecture: one state machine (`src/game/gauntlet.ts`),
   one difficulty table (`src/game/laps.ts`), one sound module
   (`src/audio/synth.ts`), shared by all four rounds. Building the four
   must-have microgames in parallel would have meant four agents editing the
   same three files at once.
   **What I did instead of the obvious thing.** Rather than splitting the
   build by microgame and hoping the edits merged cleanly, I decomposed the
   epic into 10 strictly sequential tasks matching its own build order
   (section 13.1) — skeleton, then each round in the order the epic already
   specified, then transition/attract, fail/win, audio, playtest, ship —
   dispatching one agent at a time and verifying `pnpm check` before starting
   the next.
   **How I knew it was right.** `pnpm check` gated every single task boundary;
   nothing moved forward on a red state.
   **The citation:**
   [`83bad43`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/83bad43)
   through
   [`43884ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/43884ac)
   — nine commits, one per task, each green before the next started.

2. **What happened.** `spec/crit-5.test.ts` requires a rule test that imports
   the game's own logic directly, not the built bundle — proof that "a wrong
   move is possible, and play ends" is a real, tested rule rather than a
   cosmetic claim.
   **What I did instead of the obvious thing.** `spec/rule-burst.test.ts` was
   written in the same task as Oh No itself (task 2 of 10), not bolted on
   at the end, and it imports `../src/game/ohno` directly with `dt` supplied
   by the test — no DOM, no timers, no built `dist/`.
   **How I knew it was right.** All five required cases from epic section
   12.3 pass: sub-threshold tap stays playing, a burst-threshold tap returns
   `lost`/`burst`, holding in-band returns `cleared`, leaking to shrivel
   returns `lost`/`shrivel`, and the lap-3 config bursts strictly sooner than
   lap-1 given identical taps.
   **The citation:**
   [`d080e1c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/d080e1c).

3. **What happened.** Four separate visual bugs only became visible once the
   game was actually rendered and played, not from reading the code: task 3's
   icon primitive computed its stroke weight from the icon's pixel size
   instead of the shared `U` unit, rendering every microgame icon as a solid
   black blob; task 4's fizz-gauge marker line was drawn in ink directly on
   top of the gauge's own ink outline, making it invisible; task 5's
   non-glowing Climber pad had no fill covering its own hard shadow, painting
   it solid black instead of an outline; task 7's fail-screen pips clamped
   their stroke weight to the 16px maximum, rendering as near-solid discs
   instead of thin rings.
   **What I did instead of the obvious thing.** Each task's build agent was
   required to actually load the page (via Playwright) and look at it before
   calling the task done, rather than trusting `pnpm check` alone — `pnpm
   check` has no way to notice a shape is the wrong colour.
   **How I knew it was right.** Screenshots before and after each fix,
   captured during the same task that introduced the bug.
   **The citation:**
   [`802604f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/802604f)
   (icon stroke weight),
   [`bbd3770`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/bbd3770)
   (gauge marker),
   [`57c7053`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/57c7053)
   (pad shadow),
   [`ee55a1a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/ee55a1a)
   (pip stroke weight).

4. **What happened.** Spec line 5 requires that at least one change came from
   *playing* the finished game, not from reading its code. Playtesting Keys
   Breaker end to end at both a desktop and a phone-sized viewport surfaced a
   real fairness bug: Building Climber's lap 2/3 `timerSeconds` (10.0s for
   both) was modeled directly against the shipped `src/game/climber.ts` rule
   module across the standard human-factors range for a two-alternative
   visual-discrimination task (200–450ms reaction time), and a player who
   read the glow correctly on every single tap — zero mistakes — still could
   not clear lap 3, and started failing lap 2, at a perfectly ordinary
   350–450ms reaction time. That's not a skill gap; it's a fairness bug, and
   the spec explicitly requires a stranger to be able to reach an ending.
   **What I did instead of the obvious thing.** Rather than eyeballing the
   section 11.3 table and guessing a "safer" number, the fix was derived from
   the actual reaction-time sweep against the real rule module — cited in
   full in the commit body — and only `timerSeconds` was touched (12.5s lap
   2, 15.0s lap 3); floors, stun, slip and doubles were left exactly as
   specified, since those weren't what broke.
   **How I knew it was right.** The same sweep re-run against the new values
   clears both laps through 450ms reaction time with real margin (11.4s/14.1s
   used against 12.5s/15.0s budgets).
   **The citation:**
   [`aa14e80`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/aa14e80).

## Before you ship

`pnpm check:evidence` verifies these citations resolve to real commits in this
repo, that `reflections/crit-5.md` exists, and that `CLAUDE.md` is present.
