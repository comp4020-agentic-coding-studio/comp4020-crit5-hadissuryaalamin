export interface InputHandlers {
  onTap: () => void;
  onTapLeft?: () => void;
  onTapRight?: () => void;
}

// The only crossing point from DOM events into game input. Everything
// downstream sees tap / tapLeft / tapRight, never a raw pointer or key event.
// tapLeft/tapRight fire alongside onTap on every pointer/tap, split by which
// half of the target the pointer landed on - Building Climber's two pads
// span the full width, so left/right-half is exactly the pad hit test.
// The desktop-only ArrowLeft/ArrowRight and A/D bindings are the unannounced
// bonus from epic section 6.4 - never surfaced anywhere in UI or copy.
export function attachInput(target: HTMLElement, handlers: InputHandlers): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    handlers.onTap();
    if (handlers.onTapLeft || handlers.onTapRight) {
      const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (x < rect.width / 2) {
        handlers.onTapLeft?.();
      } else {
        handlers.onTapRight?.();
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Space" || event.code === "Enter") {
      handlers.onTap();
    } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
      handlers.onTapLeft?.();
    } else if (event.code === "ArrowRight" || event.code === "KeyD") {
      handlers.onTapRight?.();
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
