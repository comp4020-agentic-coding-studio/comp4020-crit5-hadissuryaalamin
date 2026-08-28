export interface Palette {
  bg: string;
  primary: string;
  accent: string;
  pop: string;
}

export const INK = "#14100E";
export const PAPER = "#FFF6E5";

export type PaletteId = "attract" | "ohno" | "shake" | "climber" | "rhythm" | "dead";

export const PALETTES: Record<PaletteId, Palette> = {
  attract: { bg: "#FF3EA5", primary: "#FFD400", accent: "#00E0FF", pop: "#14100E" },
  ohno: { bg: "#2A2320", primary: "#FF2D1F", accent: "#FFD400", pop: "#FF7BD5" },
  shake: { bg: "#00A9A5", primary: "#FF7A00", accent: "#FFF06A", pop: "#E8175D" },
  climber: { bg: "#FFE119", primary: "#2B7FFF", accent: "#FF4FA3", pop: "#00C2A8" },
  rhythm: { bg: "#2B0F45", primary: "#FF2FB9", accent: "#43F5C4", pop: "#FFC803" },
  dead: { bg: "#14100E", primary: "#FFF6E5", accent: "#FFF6E5", pop: "#FFF6E5" },
};

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  u: number;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const stage: Stage = { canvas, ctx, width: 0, height: 0, u: 1 };
  resizeStage(stage);
  return stage;
}

export function resizeStage(stage: Stage): void {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  stage.canvas.width = Math.round(width * dpr);
  stage.canvas.height = Math.round(height * dpr);
  stage.canvas.style.width = `${width}px`;
  stage.canvas.style.height = `${height}px`;
  stage.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stage.width = width;
  stage.height = height;
  stage.u = Math.min(width, height) / 100;
}

export function fillBackground(stage: Stage, palette: Palette): void {
  stage.ctx.fillStyle = palette.bg;
  stage.ctx.fillRect(0, 0, stage.width, stage.height);
}
