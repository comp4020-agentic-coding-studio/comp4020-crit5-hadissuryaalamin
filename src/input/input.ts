export interface InputHandlers {
  onTap: () => void;
  onTapLeft?: () => void;
  onTapRight?: () => void;
}

// The only crossing point from DOM events into game input. Everything
// downstream sees tap / tapLeft / tapRight, never a raw pointer or key event.
// tapLeft/tapRight get their bindings wired in once a round needs them
// (Building Climber's pads and its unannounced arrow-key/A-D bonus).
export function attachInput(target: HTMLElement, handlers: InputHandlers): () => void {
  const onPointerDown = (): void => {
    handlers.onTap();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Space" || event.code === "Enter") {
      handlers.onTap();
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
