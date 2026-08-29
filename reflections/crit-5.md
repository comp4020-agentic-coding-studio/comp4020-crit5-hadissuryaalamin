# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

Realising that a green check was telling me almost nothing, and then doing
something about it rather than just being more careful.

I rebuilt three of the four rounds this week, and each time I went to replace
one I found the version I was replacing had never run. `drawOhno` had no caller.
`drawRhythm` had no caller. A correct climber module was never wired into
`main.ts`, so the game kept playing a placeholder. Typecheck, build and the
whole test suite were green over every one of them — and the bundler
tree-shakes the dead module out, so even the built site looked fine while a
round was quietly missing. The third time, I stopped fixing the instance and
wrote a sensor that walks the import graph from the entry point and fails on
anything nothing reaches. It caught a live bug on its first run: a fully
implemented transition sound that nothing called, with the timing constant and
latch already in place, setting a flag and playing silence.

The sharper half of the breakthrough came later, when two-human mode turned out
to have never worked — `input.ts` offered a player slot, `main.ts` took the
callback as `(_player, padIndex)` and dropped it — and my own new sensor was
green over it too, because the function *was* called; it just discarded what it
was handed. The useful move there wasn't fixing the bug, it was writing down
exactly what my sensor could not see, so I don't trust it further than it
deserves. A tool you over-trust is worse than no tool.

**What did this work change about who I want to be as a software developer?**

Two things.

The first is that I want to fix defects where they live. The same rendering
bug — strokes sized from the wrong unit, so characters filled in solid black —
was found and patched independently by four separate tasks. Every one of those
patches was correct in its own scene, and every one of them left the rig
untouched, so the defect kept its shape and kept coming back until someone
looked at it and said the graphics were still trash. They were right. When the
same failure is re-derived a third time, the thing to change is not the caller.

The second is about honesty in measurement, which I think matters more. Every
difficulty number in this game had been derived against bot cadence — synthetic
tap rates of about seven per second, CPU reaction clocks of forty milliseconds.
That is not a thumb. When I finally played Rhythm at a cadence a person could
actually produce, one round in eight at every lap ran out of clock on players
who had not made a single mistake, decided by a tiebreak instead of by the rule
the whole microgame is built on. The old derivation had never counted the
roughly nine-tenths of a second a human spends *remembering* the pattern before
the first hit — the one thing that separates a person from a CPU.

What I want to keep from that is the discipline of saying which of my numbers
are measured and which are assumed, and of stating the residual out loud. When
I widened that timeout I also recorded that a later run landed right on the new
value, and that since the round is unbounded in principle no finite number can
promise never to interrupt one: the honest claim is that I changed it from
one-in-eight to one-in-twenty-three, not that I fixed it. Two of my own earlier
notes were contradicted by real play, and I trusted the play. I'd rather be the
developer who writes down what he hasn't verified than the one whose green
suite quietly stands in for a person actually playing the game.
