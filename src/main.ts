import { createStage, fillBackground, PALETTES, resizeStage } from "./render/canvas.ts";
import {
  createGauntlet,
  currentRound,
  podiumFinished,
  restartGauntlet,
  roundResolved,
  startGauntlet,
  transitionFinished,
  type GauntletState,
} from "./game/gauntlet.ts";
import { attachInput } from "./input/input.ts";
import {
  createSynth,
  ensureAudioContext,
  playBombPass,
  playCanJolt,
  playCanLaunch,
  playClimbStep,
  playCymbalCrash,
  playExplosion,
  playFumble,
  playPadTone,
  playSlip,
  playSlump,
  playTapBlip,
  playTransitionSting,
  playWinChord,
  setFuseUrgency,
  setMuted,
  startFuseHiss,
  stopFuseHiss,
} from "./audio/synth.ts";
import { CPU_LAPS, createCpuTimer, tickCpuTimer, type CpuTimerState } from "./game/cpu.ts";
import { createCan, resolveCanPlacing, tapCan, tickCan, type CanState } from "./game/can.ts";
import {
  createBomb,
  PASS_PAD,
  resolveBombPlacing,
  tapBomb,
  tickBomb,
  wrongPad as wrongBombPad,
  type BombState,
} from "./game/bomb.ts";
import {
  createClimber,
  resolveClimberPlacing,
  tapClimber,
  tickClimber,
  wrongPad,
  type ClimberState,
} from "./game/climber.ts";
import {
  createPattern,
  expectedPad,
  resolvePatternPlacing,
  tapPattern,
  tickPattern,
  wrongPatternPad,
  type PatternState,
} from "./game/pattern.ts";
import { BOMB_LAPS, CAN_LAPS, CLIMBER_LAPS, PATTERN_LAPS } from "./game/laps.ts";
import { mulberry32, type Rng } from "./game/rng.ts";
import type { Place, Placing, RacerId } from "./game/types.ts";
import { drawAttract, type AttractState } from "./render/scenes/attract.ts";
import { drawTransition, TRANSITION_DURATION_MS, TRANSITION_STING_MS } from "./render/scenes/transition.ts";
import { drawDeadFurniture, drawWinBurst, WIN_BURST_MS } from "./render/scenes/dead.ts";
import { drawPodium, PODIUM_DURATION_MS } from "./render/scenes/podium.ts";
import { CAN_LAUNCH_HOLD_MS, drawCan } from "./render/scenes/can.ts";
import { climberGlowPulse, drawClimber } from "./render/scenes/climber.ts";
import { bombPassPulse, drawBomb, EXPLOSION_HOLD_MS } from "./render/scenes/bomb.ts";
import { drawPattern, PATTERN_RESOLVE_HOLD_MS } from "./render/scenes/pattern.ts";
import {
  createPadPressState,
  drawFourPads,
  PAD_BAND_FRACTION,
  pressPad,
  tickPadPress,
  type PadGlow,
  type PadPressState,
} from "./render/pads.ts";
import { drawCharacter, neutralPose, squashPose } from "./render/character.ts";

// v2 rebuild step 2 (epic build-order) wired the gauntlet's phase machine to
// resolve every round to a 3-racer placing via a podium screen, instead of a
// solo cleared/lost status. Steps 3 to 6 then replaced the THROWAWAY "first to
// N pad taps wins" race with a real microgame, one round id at a time. With
// this file's Follow the Rhythm wiring ALL FOUR rounds are now the real
// mechanic and nothing reaches the throwaway path any more. It is kept, and
// kept last in the branch, purely as the fallback for a round id that somehow
// has no scene of its own - a blank screen would be the worse failure.

const THROWAWAY_TARGET_TAPS = 15;
const THROWAWAY_TIMEOUT_MS = 20_000;

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const muteButton = document.getElementById("mute") as HTMLButtonElement;

const stage = createStage(canvas);
const synth = createSynth();

const PRESS_HOLD_MS = 90;

let gauntlet: GauntletState = createGauntlet();
let podiumElapsedMs = 0;
let wonElapsedMs = 0;

const attractState: AttractState = { seed: Math.floor(Math.random() * 0xffffffff), elapsedMs: 0, pressElapsedMs: null };
let transitionElapsedMs = 0;
let transitionSeed = 0;
let transitionStingFired = false;

let padPressState: PadPressState = createPadPressState();

// Throwaway round state (rounds not yet rebuilt) — reset in enterCurrentRound().
let throwawayTaps: [number, number, number] = [0, 0, 0];
let throwawayFinishOrder: [number | null, number | null, number | null] = [null, null, null];
let throwawayFinishedCount = 0;
let throwawayElapsedMs = 0;
let throwawayCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(1)),
  createCpuTimer(CPU_LAPS[1], mulberry32(2)),
];
let throwawayRng: Rng = mulberry32(0);

// Shake the Can state — reset in enterCurrentRound(). CPU racers always
// alternate through all four pads in a fixed cycle (guaranteeing altGain
// whenever they don't error), which is enough to make them a real contest
// without needing pad-reading logic of their own.
// `canLaunchMs` holds the can scene on screen after the round resolves, so the
// launch is seen at the can instead of heard over the podium — the same shape
// `bombExplodeMs` and `patternResolveMs` use, and the reason task 018 flagged
// this round as the one terminal moment with no hold of its own.
let canState: CanState = createCan();
let canLaunchMs = 0;
let canCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(3)),
  createCpuTimer(CPU_LAPS[1], mulberry32(4)),
];
let canCpuRng: Rng = mulberry32(5);

// Building Climber state - reset in enterCurrentRound(). `climberRng` drives
// the rule module's own randomness (which pad the glow jumps to, and the
// doubles roll); `climberCpuRng` is separate so a CPU racer's error rolls
// can't shift the glow sequence the human is reading. `climberSeed` is the
// scene's stable per-round jitter seed for the tower.
let climberState: ClimberState = createClimber(mulberry32(6));
let climberRng: Rng = mulberry32(7);
let climberCpuRng: Rng = mulberry32(8);
let climberSeed = 0;
let climberCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(9)),
  createCpuTimer(CPU_LAPS[1], mulberry32(10)),
];

// Oh No state - reset in enterCurrentRound(). The bomb RULE consumes no
// randomness at all (one fixed pass pad, one fixed ring order), so unlike
// Climber there is no rule stream to keep separate: `bombCpuRng` is the only
// live stream, feeding the rivals' error rolls and the pad they fumble onto,
// and `bombSeed` is the scene's stable per-round jitter. Keeping the CPU
// stream to itself still matters — a rival's mistakes must never shift what
// the human is reading. `bombExplodeMs` holds the bomb scene on screen after
// the fuse dies so the bang is actually seen before the podium takes over.
let bombState: BombState = createBomb(BOMB_LAPS[1]);
let bombCpuRng: Rng = mulberry32(11);
let bombSeed = 0;
let bombExplodeMs = 0;
let bombCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(12)),
  createCpuTimer(CPU_LAPS[1], mulberry32(13)),
];

// Follow the Rhythm state - reset in enterCurrentRound(). `patternRng` is the
// rule module's own stream (it deals every pattern), and `patternCpuRng` is
// kept separate so a rival's error rolls can never shift the pattern the human
// is reading - the same separation Climber needs, for the same reason.
// `patternLitAtMs` is how the render loop notices a NEW hit from the game
// master, since the rule exposes a hit as a stamp rather than as an event.
let patternState: PatternState = createPattern(PATTERN_LAPS[1], mulberry32(14));
let patternRng: Rng = mulberry32(15);
let patternCpuRng: Rng = mulberry32(16);
let patternSeed = 0;
let patternResolveMs = 0;
let patternLitAtMs: number | null = null;
// How many racers had dropped out as of the last frame. A new entry in
// `eliminationOrder` is how the render loop notices a slump to sound, the
// same way `patternLitAtMs` notices a new hit from the game master: the rule
// module exposes state, never events.
let patternEliminatedCount = 0;
let patternCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(17)),
  createCpuTimer(CPU_LAPS[1], mulberry32(18)),
];

function syncMuteButton(): void {
  muteButton.setAttribute("aria-pressed", String(synth.muted));
}
syncMuteButton();

muteButton.addEventListener("click", () => {
  setMuted(synth, !synth.muted);
  syncMuteButton();
});

function resolveThrowawayPlacing(): Placing {
  if (throwawayFinishedCount < 3) {
    const remaining = ([0, 1, 2] as const).filter((r) => throwawayFinishOrder[r] === null);
    remaining.sort((a, b) => throwawayTaps[b] - throwawayTaps[a]);
    for (const r of remaining) throwawayFinishOrder[r] = throwawayFinishedCount++;
  }
  return [
    (throwawayFinishOrder[0]! + 1) as Place,
    (throwawayFinishOrder[1]! + 1) as Place,
    (throwawayFinishOrder[2]! + 1) as Place,
  ];
}

function enterCurrentRound(): void {
  // The fuse is the game's only sustained voice, so it is the only sound that
  // can outlive the round that started it. Killed here as well as at the
  // bang, so no path into a round can ever leave it hissing under another one.
  stopFuseHiss(synth);

  throwawayTaps = [0, 0, 0];
  throwawayFinishOrder = [null, null, null];
  throwawayFinishedCount = 0;
  throwawayElapsedMs = 0;
  const seed = Math.floor(Math.random() * 0xffffffff);
  throwawayRng = mulberry32(seed);
  throwawayCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(seed ^ 0x9e3779b9)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(seed ^ 0x85ebca6b)),
  ];

  canState = createCan();
  canLaunchMs = 0;
  const canSeed = Math.floor(Math.random() * 0xffffffff);
  canCpuRng = mulberry32(canSeed);
  canCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(canSeed ^ 0x27d4eb2f)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(canSeed ^ 0x165667b1)),
  ];

  climberSeed = Math.floor(Math.random() * 0xffffffff);
  climberRng = mulberry32(climberSeed);
  climberState = createClimber(climberRng);
  climberCpuRng = mulberry32(climberSeed ^ 0x2545f491);
  climberCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(climberSeed ^ 0x6c078965)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(climberSeed ^ 0x1b873593)),
  ];

  bombState = createBomb(BOMB_LAPS[gauntlet.lap]);
  bombExplodeMs = 0;
  bombSeed = Math.floor(Math.random() * 0xffffffff);
  bombCpuRng = mulberry32(bombSeed ^ 0x7feb352d);
  bombCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(bombSeed ^ 0x846ca68b)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(bombSeed ^ 0xc2b2ae35)),
  ];

  patternSeed = Math.floor(Math.random() * 0xffffffff);
  patternRng = mulberry32(patternSeed);
  patternState = createPattern(PATTERN_LAPS[gauntlet.lap], patternRng);
  patternCpuRng = mulberry32(patternSeed ^ 0x5bd1e995);
  patternResolveMs = 0;
  patternLitAtMs = null;
  patternEliminatedCount = 0;
  patternCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(patternSeed ^ 0xcc9e2d51)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(patternSeed ^ 0x1b873593)),
  ];
}

function beginTransition(): void {
  transitionElapsedMs = 0;
  transitionSeed = Math.floor(Math.random() * 0xffffffff);
  transitionStingFired = false;
}

// The racers a CPU still drives. Racer 0 is always human; racer 1 stops being
// driven the instant a second human takes that seat, or the CPU would go on
// playing the round on top of them.
function cpuRacers(): (1 | 2)[] {
  return ([1, 2] as const).filter((r) => !gauntlet.racers[r].isHuman);
}

function handleTap(): void {
  ensureAudioContext(synth);

  if (gauntlet.phase === "attract") {
    if (attractState.pressElapsedMs === null) {
      attractState.pressElapsedMs = 0;
      playTapBlip(synth);
    }
    return;
  }

  if (gauntlet.phase === "dead" || gauntlet.phase === "won") {
    // Restarting jumps straight back to attract without passing through
    // enterCurrentRound(), so the fuse gets its own stop here too.
    stopFuseHiss(synth);
    gauntlet = restartGauntlet();
    attractState.pressElapsedMs = null;
    return;
  }

  // Taps during the transition and the podium hold are swallowed — only the
  // "round" phase forwards input into game logic (epic section 8).
}

// The desktop-only second human (epic sections 3 and 4): racer 1 stops being
// CPU the instant a 1-4 key is first pressed. Discovered, never advertised —
// nothing on screen says the seat is there. The run's own elimination and pips
// still track racer 0 specifically, per epic section 6.
function secondPlayerJoins(): void {
  if (gauntlet.racers[1].isHuman) return;
  const racers = gauntlet.racers.slice();
  racers[1] = { ...racers[1], isHuman: true };
  gauntlet = { ...gauntlet, racers };
}

// Which racer owns a given pad press. Player slot 1 only ever reaches here
// after secondPlayerJoins() has run, so a stray digit key before that cannot
// hand a round to a racer the CPU is still driving.
function racerForPlayer(player: 0 | 1): RacerId {
  return player === 1 && gauntlet.racers[1].isHuman ? 1 : 0;
}

function handlePad(player: 0 | 1, padIndex: 0 | 1 | 2 | 3): void {
  ensureAudioContext(synth);
  // The pad band is player 1's readout. A second human on the keyboard gets no
  // band of their own — there is one set of four pads on screen and two people
  // reaching for it, which is the arcade cabinet this borrows from.
  if (player === 0) padPressState = pressPad(padPressState, padIndex);

  if (gauntlet.phase !== "round") return;
  const racerId = racerForPlayer(player);

  if (currentRound(gauntlet) === "shake") {
    if (canState.status !== "playing") return;
    canState = tapCan(canState, racerId, padIndex, CAN_LAPS[gauntlet.lap]);
    // Pitched by pad, so alternating across the four pads (which is what
    // earns altGain) sounds different from hammering one (sameGain). The rule
    // is in the sound; nothing anywhere states it.
    playCanJolt(synth, padIndex);
    return;
  }

  if (currentRound(gauntlet) === "climber") {
    if (climberState.status !== "playing") return;
    const before = climberState.racers[racerId];
    // A tap the rule module will ignore anyway (already on the roof, or still
    // stunned) gets no sound either - silence IS the readout that the stun is
    // still running.
    if (before.finishOrder !== null || before.stunRemaining > 0) return;
    const correct = padIndex === before.expectedPad;
    climberState = tapClimber(climberState, racerId, padIndex, CLIMBER_LAPS[gauntlet.lap], climberRng);
    if (correct) playClimbStep(synth, padIndex);
    else playSlip(synth);
    return;
  }

  if (currentRound(gauntlet) === "ohno") {
    if (bombState.status !== "playing") return;
    // A tap from someone who is not holding the bomb, or who is still frozen
    // after a fumble, is silent as well as inert - the silence IS the readout
    // that it is not your problem yet (or not yet again).
    if (bombState.holder !== racerId || bombState.racers[racerId].stunRemaining > 0) return;
    bombState = tapBomb(bombState, racerId, padIndex, BOMB_LAPS[gauntlet.lap]);
    if (padIndex === PASS_PAD) playBombPass(synth);
    else playFumble(synth);
    return;
  }

  if (currentRound(gauntlet) === "rhythm") {
    if (patternState.status !== "playing") return;
    // A pad hit while the game master is still sounding the pattern is inert
    // AND silent: waiting is part of the rule, and being answered with nothing
    // is how that gets learned. It is never an elimination.
    const owed = expectedPad(patternState, racerId);
    if (owed === null) return;
    patternState = tapPattern(patternState, racerId, padIndex);
    // Only the correct echo is sounded here. A wrong pad is an ELIMINATION in
    // this round, not a stumble, and it gets the slump - fired from the frame
    // loop off `eliminationOrder`, so a rival dropping out sounds exactly the
    // same as the human doing it.
    if (padIndex === owed) playPadTone(synth, padIndex);
    return;
  }

  if (throwawayFinishOrder[racerId] !== null) return;
  throwawayTaps[racerId]++;
  playTapBlip(synth);
  if (throwawayTaps[racerId] >= THROWAWAY_TARGET_TAPS) {
    throwawayFinishOrder[racerId] = throwawayFinishedCount++;
  }
}

attachInput(canvas, {
  onTap: handleTap,
  onPad: (player, padIndex) => handlePad(player, padIndex),
  onSecondPlayerJoin: secondPlayerJoins,
});

window.addEventListener("resize", () => resizeStage(stage));

// The transition routine's wipe reveals this "incoming scene" preview behind
// it — a generic standing-racers preview, since the throwaway round has no
// per-round static scene of its own. Real microgames (tasks 013-016) will
// give drawTransition their own preview via the same callback shape.
function drawIncomingRoundStatic(): void {
  // Just the incoming round's control surface. It used to also stand the
  // three racers here, which put the SAME three racers on screen twice — once
  // on the announcement card and once underneath it, poking out below the
  // card's bottom edge at 390x844 where the card is smallest. The pad band is
  // enough: it says a round is about to start, and it is the one piece of
  // furniture every round shares.
  drawFourPads(stage, padPressState);
}

function drawThrowawayRound(): void {
  const spacing = stage.width / 4;
  for (let i = 0; i < 3; i++) {
    const progress = Math.min(1, throwawayTaps[i] / THROWAWAY_TARGET_TAPS);
    drawCharacter(stage, {
      seed: i + 1,
      cx: spacing * (i + 1),
      // Down on the pad band's top edge, where a real round stands its cast.
      // At 0.7 the preview's heads pushed out from under the transition card
      // at phone size and the routine showed the same three racers twice, in
      // two rows.
      feetY: stage.height * (1 - PAD_BAND_FRACTION),
      heightU: 20,
      color: gauntlet.racers[i].colour,
      eye: progress > 0.5 ? "wide" : "normal",
      mouth: progress > 0.5 ? "gritted" : "neutral",
      pose: squashPose(progress * 0.4),
    });
  }
  drawFourPads(stage, padPressState);
}

let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  const dtMs = dt * 1000;
  lastTime = now;

  attractState.elapsedMs += dtMs;

  if (gauntlet.phase === "attract" && attractState.pressElapsedMs !== null) {
    attractState.pressElapsedMs += dtMs;
    if (attractState.pressElapsedMs >= PRESS_HOLD_MS) {
      gauntlet = startGauntlet();
      beginTransition();
      attractState.pressElapsedMs = null;
    }
  }

  if (gauntlet.phase === "transition") {
    transitionElapsedMs += dtMs;
    // t=0.45s, the instant the ink wipe finishes crossing the screen (epic v1
    // section 8). The flag exists so a long frame can never fire it twice.
    // It was there from v1 and the sound function was there from v1, but
    // nothing ever joined them up, so the transition has been running silent
    // this whole time — caught by the new dead-code sensor, not by any of
    // typecheck, build or vitest, all of which were green over it.
    if (!transitionStingFired && transitionElapsedMs >= TRANSITION_STING_MS) {
      transitionStingFired = true;
      playTransitionSting(synth);
    }
    if (transitionElapsedMs >= TRANSITION_DURATION_MS) {
      gauntlet = transitionFinished(gauntlet);
      enterCurrentRound();
    }
  }

  if (gauntlet.phase === "round" && currentRound(gauntlet) === "shake") {
    const config = CAN_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];
    for (const racerId of cpuRacers()) {
      const tick = tickCpuTimer(canCpuTimers[racerId - 1], cpuConfig, dtMs, canCpuRng);
      canCpuTimers[racerId - 1] = tick.timer;
      if (tick.acted && !tick.errored) {
        const lastPad = canState.racers[racerId].lastPad;
        const nextPad = ((lastPad ?? -1) + 1) % 4;
        canState = tapCan(canState, racerId, nextPad, config);
      }
    }

    const wasPlaying = canState.status === "playing";
    canState = tickCan(canState, config, dt);
    // The launch fires on the frame the round resolves, and the placing is
    // then held back for CAN_LAUNCH_HOLD_MS so the cans are actually seen to
    // go up. Without the hold the podium took over on the same frame and the
    // 700ms sound played over it (task 018's finding).
    if (wasPlaying && canState.status === "resolved") playCanLaunch(synth);
    if (canState.status === "resolved") {
      canLaunchMs += dtMs;
      if (canLaunchMs >= CAN_LAUNCH_HOLD_MS) {
        gauntlet = roundResolved(gauntlet, resolveCanPlacing(canState));
        podiumElapsedMs = 0;
      }
    }
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "climber") {
    const config = CLIMBER_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];
    for (const racerId of cpuRacers()) {
      const tick = tickCpuTimer(climberCpuTimers[racerId - 1], cpuConfig, dtMs, climberCpuRng);
      climberCpuTimers[racerId - 1] = tick.timer;
      if (!tick.acted) continue;
      // A CPU error in Climber reads as hitting a pad that is NOT glowing -
      // the same slip + stun the human gets, which is what makes a rival
      // visibly fallible rather than a wall (epic section 5).
      const padIndex = tick.errored
        ? wrongPad(climberState, racerId, climberCpuRng)
        : climberState.racers[racerId].expectedPad;
      climberState = tapClimber(climberState, racerId, padIndex, config, climberRng);
    }

    climberState = tickClimber(climberState, config, dt);
    // Checked after the tick rather than against a pre-tick snapshot: unlike
    // Shake, Climber can also resolve inside tapClimber (the third racer
    // reaching the roof), including from a human tap between frames.
    if (climberState.status === "resolved") {
      gauntlet = roundResolved(gauntlet, resolveClimberPlacing(climberState));
      podiumElapsedMs = 0;
    }
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    const config = BOMB_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];

    // Only the racer actually holding the bomb has a decision to make, so
    // only their reaction clock runs: a CPU's reaction is measured from the
    // moment the bomb lands in their hands, and freezes again the instant
    // they get rid of it. A stunned rival's clock stops too, which is what
    // makes their fumble visibly cost them the same tempo it costs a human.
    const holder = bombState.holder;
    if (
      bombState.status === "playing" &&
      !gauntlet.racers[holder].isHuman &&
      bombState.racers[holder].stunRemaining <= 0
    ) {
      const tick = tickCpuTimer(bombCpuTimers[holder - 1], cpuConfig, dtMs, bombCpuRng);
      bombCpuTimers[holder - 1] = tick.timer;
      const holderFumbles = bombState.racers[holder].fumbles;
      if (tick.acted) {
        // A CPU error here reads as grabbing for the wrong pad - the same
        // fumble and the same stun a human gets (epic section 5).
        const padIndex = tick.errored ? wrongBombPad(bombCpuRng) : PASS_PAD;
        bombState = tapBomb(bombState, holder, padIndex, config);
        // Rivals are audible, and audible the same way the human is: the bomb
        // going round the ring is the round's pulse, and a rival fumbling is
        // half the joke (epic section 5). Read off the state the tap produced
        // rather than off `padIndex`, so a tap the rule ignored stays silent.
        if (bombState.holder !== holder) playBombPass(synth);
        else if (bombState.racers[holder].fumbles > holderFumbles) playFumble(synth);
      }
    }

    bombState = tickBomb(bombState, config, dt);

    // The fuse hisses for exactly as long as it is burning, and gets louder,
    // brighter and faster as it shortens. Started here rather than on
    // entering the round because ensureAudioContext only runs on a gesture -
    // this is the first frame that can be sure there is a context at all.
    if (bombState.status === "playing") {
      startFuseHiss(synth);
      setFuseUrgency(synth, 1 - bombState.fuseRemaining / config.fuseSeconds);
    }
    // Checked AFTER the tick, never against a pre-tick snapshot. The bang is
    // then held on screen for EXPLOSION_HOLD_MS before the placing is handed
    // to the gauntlet, because a fail the player never sees is not a fail
    // they can learn from (spec line 2: it can be lost).
    if (bombState.status === "resolved") {
      if (bombExplodeMs === 0) {
        // The hiss has to stop on the SAME frame the bang fires - a fuse
        // still crackling under the explosion is the one thing that would
        // give away that the two are not the same object.
        stopFuseHiss(synth);
        playExplosion(synth);
      }
      bombExplodeMs += dtMs;
      if (bombExplodeMs >= EXPLOSION_HOLD_MS) {
        gauntlet = roundResolved(gauntlet, resolveBombPlacing(bombState));
        podiumElapsedMs = 0;
      }
    }
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "rhythm") {
    const config = PATTERN_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];

    // Only a racer who still owes hits has a decision to make, so only their
    // reaction clock runs - the same shape Oh No uses for whoever is holding
    // the bomb. A rival's clock starts when the cymbals come down and stops
    // the moment they finish echoing.
    for (const racerId of cpuRacers()) {
      const owed = expectedPad(patternState, racerId);
      if (owed === null) continue;
      const tick = tickCpuTimer(patternCpuTimers[racerId - 1], cpuConfig, dtMs, patternCpuRng);
      patternCpuTimers[racerId - 1] = tick.timer;
      if (!tick.acted) continue;
      // A rival's mistake here reads as reaching for the wrong pad, and costs
      // them exactly what it costs a human: the round.
      const padIndex = tick.errored ? wrongPatternPad(patternState, racerId, patternCpuRng) : owed;
      patternState = tapPattern(patternState, racerId, padIndex);
    }

    patternState = tickPattern(patternState, config, dt, patternRng);

    // The game master's hits arrive as a stamp, not an event, so a new hit is
    // a changed stamp. Crash plus that pad's own pitch, low to high and left
    // to right - the audio half of a readout that has to work without it.
    if (patternState.litPad !== null && patternState.litSinceMs !== patternLitAtMs) {
      patternLitAtMs = patternState.litSinceMs;
      playCymbalCrash(synth);
      playPadTone(synth, patternState.litPad, true);
    }

    // A racer dropping out arrives as a longer `eliminationOrder`, never as an
    // event, so a new entry is what a slump sounds off. Human or rival, the
    // same sound: watching the other guy go out is the round teaching the
    // elimination rule, and it wanted an ear as well as an eye. Sounded once
    // per frame rather than once per new entry - two racers can go out between
    // frames, and two copies of one sound started on the same sample are one
    // louder sound, not two slumps.
    if (patternEliminatedCount < patternState.eliminationOrder.length) {
      patternEliminatedCount = patternState.eliminationOrder.length;
      playSlump(synth);
    }

    // Checked AFTER the tick, never against a pre-tick snapshot: this round
    // resolves inside tapPattern (the second elimination), including from a
    // human tap landing between frames. The scene is then held for
    // PATTERN_RESOLVE_HOLD_MS so the final slump is actually seen - without
    // the hold the podium takes over on the same tick and the elimination
    // rule loses its only teacher.
    if (patternState.status === "resolved") {
      patternResolveMs += dtMs;
      if (patternResolveMs >= PATTERN_RESOLVE_HOLD_MS) {
        gauntlet = roundResolved(gauntlet, resolvePatternPlacing(patternState));
        podiumElapsedMs = 0;
      }
    }
  } else if (gauntlet.phase === "round") {
    throwawayElapsedMs += dtMs;
    const cpuConfig = CPU_LAPS[gauntlet.lap];
    for (const racerId of cpuRacers()) {
      if (throwawayFinishOrder[racerId] !== null) continue;
      const tick = tickCpuTimer(throwawayCpuTimers[racerId - 1], cpuConfig, dtMs, throwawayRng);
      throwawayCpuTimers[racerId - 1] = tick.timer;
      if (tick.acted && !tick.errored) {
        throwawayTaps[racerId]++;
        if (throwawayTaps[racerId] >= THROWAWAY_TARGET_TAPS) {
          throwawayFinishOrder[racerId] = throwawayFinishedCount++;
        }
      }
    }

    if (throwawayFinishedCount === 3 || throwawayElapsedMs >= THROWAWAY_TIMEOUT_MS) {
      const placing = resolveThrowawayPlacing();
      gauntlet = roundResolved(gauntlet, placing);
      podiumElapsedMs = 0;
    }
  }

  if (gauntlet.phase === "podium") {
    podiumElapsedMs += dtMs;
    if (podiumElapsedMs >= PODIUM_DURATION_MS) {
      const wasEliminated = gauntlet.eliminated;
      gauntlet = podiumFinished(gauntlet);
      if (gauntlet.phase === "transition") beginTransition();
      else if (gauntlet.phase === "won") {
        wonElapsedMs = 0;
        playWinChord(synth);
      }
      void wasEliminated;
    }
  }

  const paletteId =
    gauntlet.phase === "dead" || gauntlet.phase === "won"
      ? "dead"
      : gauntlet.phase === "round" || gauntlet.phase === "transition" || gauntlet.phase === "podium"
        ? currentRound(gauntlet)
        : "attract";
  const palette = PALETTES[paletteId];
  document.body.style.background = palette.bg;
  fillBackground(stage, palette);

  if (gauntlet.phase === "attract") {
    drawAttract(stage, attractState);
  } else if (gauntlet.phase === "transition") {
    drawTransition(
      stage,
      transitionElapsedMs,
      { toRound: currentRound(gauntlet), seed: transitionSeed, racers: gauntlet.racers },
      drawIncomingRoundStatic,
    );
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "shake") {
    drawCan(stage, canState, CAN_LAPS[gauntlet.lap], gauntlet.racers, canLaunchMs);
    drawFourPads(stage, padPressState);
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "climber") {
    drawClimber(stage, climberState, CLIMBER_LAPS[gauntlet.lap], gauntlet.racers, climberSeed);
    // The human's own glowing pad, repeated at the bottom of the screen in
    // the same colour and on the same pulse phase as the ring over their
    // climber's head - one signal, stated twice, which is the whole lesson.
    const human = climberState.racers[0];
    const glow: PadGlow | null =
      human.finishOrder === null
        ? { index: human.expectedPad, pulse: climberGlowPulse(climberState.elapsedMs) }
        : null;
    drawFourPads(stage, padPressState, glow);
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    drawBomb(stage, bombState, BOMB_LAPS[gauntlet.lap], gauntlet.racers, bombSeed, bombExplodeMs);
    // Pad 0 pulses only while the HUMAN is holding the bomb - the pad lights
    // up exactly when it is their problem, and goes quiet the instant they
    // pass. That pairing, plus the ring around the bomb on the same pulse
    // phase, is the whole self-taught lesson of the round (epic 7.3).
    const passGlow: PadGlow | null =
      bombState.status === "playing" && bombState.holder === 0
        ? { index: PASS_PAD, pulse: bombPassPulse(bombState.elapsedMs) }
        : null;
    drawFourPads(stage, padPressState, passGlow);
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "rhythm") {
    drawPattern(stage, patternState, PATTERN_LAPS[gauntlet.lap], gauntlet.racers, patternSeed, patternResolveMs);
    // The pad band lights ONLY while the game master is sounding the pattern,
    // and goes plain the moment it is the racers' turn. That is the honest
    // half of the affordance: highlighting the pad a player owes would hand
    // them the answer, so the pads teach the colour-to-pad mapping during the
    // call and say nothing whatever during the response.
    const demoGlow: PadGlow | null =
      patternState.status === "playing" && patternState.litPad !== null
        ? { index: patternState.litPad, pulse: 1.06 }
        : null;
    drawFourPads(stage, padPressState, demoGlow);
  } else if (gauntlet.phase === "round") {
    drawThrowawayRound();
  } else if (gauntlet.phase === "podium" && gauntlet.lastPlacing) {
    drawPodium(stage, gauntlet.racers, gauntlet.lastPlacing, podiumElapsedMs);
  } else if (gauntlet.phase === "dead") {
    drawDeadFurniture(stage, gauntlet.cleared, podiumElapsedMs);
  } else if (gauntlet.phase === "won" && wonElapsedMs < WIN_BURST_MS) {
    drawWinBurst(stage, wonElapsedMs);
  } else if (gauntlet.phase === "won") {
    drawDeadFurniture(stage, gauntlet.cleared, wonElapsedMs);
  }

  padPressState = tickPadPress(padPressState, dtMs);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

