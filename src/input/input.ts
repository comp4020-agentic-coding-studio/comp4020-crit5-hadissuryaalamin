export type PadIndex = 0 | 1 | 2 | 3;
export type PlayerSlot = 0 | 1;

export interface InputHandlers {
  onTap: () => void;
  // v1 Climber's left/right-half split — kept for backward compatibility
  // until task 014 ports Climber onto the onPad model below and this pair
  // can be retired.
  onTapLeft?: () => void;
  onTapRight?: () => void;
  // v2's four-pad model (epic section 4). `player` is which human seat
  // pressed the pad: 0 is always the primary human (pointer/touch, or the
  // D F J K keys); 1 is the desktop-only second human, discovered the first
  // time a 1-4 key is pressed (see onSecondPlayerJoin).
  onPad?: (player: PlayerSlot, pad: PadIndex) => void;
  // Fires exactly once per session, the instant a 1-4 key is first pressed —
  // this is how a second human's seat is discovered rather than advertised.
  onSecondPlayerJoin?: () => void;
}

// The four-pad band occupies the bottom 22% of the screen (epic v2 section 4
// / src/render/pads.ts's PAD_BAND_FRACTION — duplicated here rather than
// imported so this module has no dependency on render).
const PAD_BAND_FRACTION = 0.22;

const PAD_KEYS_P1: Partial<Record<string, PadIndex>> = {
  KeyD: 0,
  KeyF: 1,
  KeyJ: 2,
  KeyK: 3,
};
const PAD_KEYS_P2: Partial<Record<string, PadIndex>> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
};

// The only crossing point from DOM events into game input. Everything
// downstream sees tap / tapLeft / tapRight / onPad, never a raw pointer or
// key event. Desktop pad bindings (D F J K, 1 2 3 4) are never announced on
// screen — discovered by touch/press, never advertised (epic v2 section 4).
export function attachInput(target: HTMLElement, handlers: InputHandlers): () => void {
  let secondPlayerJoined = false;

  const padIndexForX = (clientX: number, rect: DOMRect): PadIndex => {
    const relX = Math.min(rect.width - 1, Math.max(0, clientX - rect.left));
    return Math.min(3, Math.floor((relX / rect.width) * 4)) as PadIndex;
  };

  const onPointerDown = (event: PointerEvent): void => {
    handlers.onTap();
    const rect = target.getBoundingClientRect();

    if (handlers.onTapLeft || handlers.onTapRight) {
      const x = event.clientX - rect.left;
      if (x < rect.width / 2) {
        handlers.onTapLeft?.();
      } else {
        handlers.onTapRight?.();
      }
    }

    if (handlers.onPad) {
      const bandTop = rect.top + rect.height * (1 - PAD_BAND_FRACTION);
      if (event.clientY >= bandTop) {
        handlers.onPad(0, padIndexForX(event.clientX, rect));
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Space" || event.code === "Enter") {
      handlers.onTap();
      return;
    }
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      handlers.onTapLeft?.();
    } else if (event.code === "ArrowRight") {
      handlers.onTapRight?.();
    }

    const p1Pad = PAD_KEYS_P1[event.code];
    if (p1Pad !== undefined) {
      // KeyD doubles as v1 Climber's ArrowRight-equivalent bonus above and
      // v2's pad 0 binding here — harmless overlap, since a caller only
      // receives whichever handler it actually passed in.
      handlers.onTapRight?.();
      handlers.onPad?.(0, p1Pad);
      return;
    }

    const p2Pad = PAD_KEYS_P2[event.code];
    if (p2Pad !== undefined) {
      if (!secondPlayerJoined) {
        secondPlayerJoined = true;
        handlers.onSecondPlayerJoin?.();
      }
      handlers.onPad?.(1, p2Pad);
    }
  };

  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  target.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  target.addEventListener("contextmenu", onContextMenu);

  return () => {
    target.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("contextmenu", onContextMenu);
  };
}
