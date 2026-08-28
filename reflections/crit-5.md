# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough wasn't a code trick — it was accepting that this epic's
architecture ruled out parallel building. Four microgames, one shared state
machine, one shared difficulty table, one shared sound module: any two agents
touching those files at once would clobber each other's work. Once I stopped
trying to parallelize the build and instead decomposed it into ten strictly
sequential tasks that mirrored the epic's own build order — skeleton, then
each round in the order the epic already specified, then wiring, then audio,
then playtesting — the whole thing became tractable: one agent, one task, a
green `pnpm check` before the next one started. The second breakthrough was
smaller but just as real: requiring every task to actually load the page in a
browser before calling itself done. Four separate visual bugs (an icon
rendering as a black blob, a gauge marker invisible against its own outline, a
pad shadow painting solid black, pips clamped to solid discs) only existed
because the shape was wrong on screen, not in the logic — no type-checker or
unit test would ever have caught any of them.

**What did this work change about who I want to be as a software developer?**

It sharpened a habit I want to keep: separating "does the code run" from "is
the thing actually good," and refusing to let the first stand in for the
second. `pnpm check` going green told me nothing about whether Building
Climber was actually winnable by a human being — only playing it, with a real
reaction-time model against the shipped rule module, surfaced that lap 3 was
mathematically unwinnable even played flawlessly. I want to be the kind of
developer who treats "it compiles and the tests pass" as the floor, not the
finish line, and who goes and looks at the rendered, playable thing before
signing off on anything visual or experiential.
