# Process overview

## What I built

**Keys Breaker** is a four-round, three-lap Bishi Bashi-style arcade gauntlet
on a single `<canvas>`: three racers — you and two rivals — compete on four
fixed pads through Shake the Can, Building Climber, Oh No It's Gonna Explode
and Follow the Rhythm, placing 1st/2nd/3rd each round, with elimination and a
podium.

The interesting part of this week is that I built it twice. The first version
was a solo score-attack game and very static visualization; 
game — Bishi Bashi is about *racing someone* and more like comic comedy. The idea is to bring my childhood memories,
playing games on playstation with my friends.
## The moments that mattered

1. I reused `/pm-discovery`, a skill I created for Crit 4, to brainstorm the
   game concept and implementation approach. It produced `epic.md`, which became
   the master plan passed to `/epic-dispatch` for implementation
   ([`83bad43`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/83bad43)).

2. After the first dispatch finished, I manually tested the game in the browser.
   Although it built and passed its tests, the result—especially the graphics—felt
   too static, flat and different from what I intended
   ([`8db00bb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/8db00bb)).

3. I revised `epic.md` using visual references from similar GitHub projects,
   then ran `/epic-dispatch` again. The second version was better, but showed me
   that a detailed plan alone could not replace manual art direction and
   playtesting
   ([`334179a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/334179a)–[`f29147f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/f29147f)).

4. Manual testing also revealed that two-human mode had never worked because
   `main.ts` discarded the player information supplied by `input.ts`. This
   passed typechecking, tests and the dead-code sensor, demonstrating that
   complete user interactions still needed to be tested directly
   ([`439468d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/439468d),
   [`77c107c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/77c107c)).

5. Instead of continuing to patch individual scenes, I fixed the shared
   character rig and rendering system. Comparing screenshots at desktop and
   mobile sizes confirmed that racer colours, movement and props became much
   clearer
   ([`a8afee8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/a8afee8)–[`c08c6e8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-hadissuryaalamin/commit/c08c6e8)).

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
