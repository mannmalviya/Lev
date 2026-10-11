// Draws a FlappyState like the classic FlapPyBird screen.

import { FLAPPY, type FlappyState } from "@s1/engine";

const F = FLAPPY;
const NAMES = [
  "background-day", "base", "pipe-green", "yellowbird-upflap", "yellowbird-midflap", "yellowbird-downflap",
  "gameover", "message", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;
type Name = (typeof NAMES)[number];
export type FlappyImages = Record<Name, HTMLImageElement>;

let cache: Promise<FlappyImages> | null = null;

export function loadFlappyImages(): Promise<FlappyImages> {
  cache ??= Promise.all(
    NAMES.map(
      (n) =>
        new Promise<[Name, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([n, img]);
          img.onerror = reject;
          img.src = `/sprites/flappy/${n}.png`;
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs) as FlappyImages);
  return cache;
}

export type Overlay = "ready" | "gameover" | null;

export function drawFlappy(ctx: CanvasRenderingContext2D, s: FlappyState, img: FlappyImages, overlay: Overlay) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img["background-day"], 0, 0);

  for (const p of s.pipes) {
    // Upper pipe is the same sprite flipped upside down.
    ctx.save();
    ctx.translate(p.x, p.gapY);
    ctx.scale(1, -1);
    ctx.drawImage(img["pipe-green"], 0, 0);
    ctx.restore();
    ctx.drawImage(img["pipe-green"], p.x, p.gapY + F.PIPE_GAP);
  }

  ctx.drawImage(img.base, s.baseX, F.BASE_Y);

  // Wing cycle [0,1,2,1], one step every 3 frames; wings stop when dead.
  const wing = s.over ? 1 : [0, 1, 2, 1][Math.floor(s.frame / 3) % 4];
  const bird = img[(["yellowbird-upflap", "yellowbird-midflap", "yellowbird-downflap"] as const)[wing]];
  const visibleRot = Math.min(s.rot, 20);
  ctx.save();
  ctx.translate(F.BIRD_X + F.BIRD_W / 2, s.birdY + F.BIRD_H / 2);
  ctx.rotate((-visibleRot * Math.PI) / 180);
  ctx.drawImage(bird, -F.BIRD_W / 2, -F.BIRD_H / 2);
  ctx.restore();

  if (overlay !== "ready") {
    const digits = String(s.score).split("");
    const w = digits.reduce((sum, d) => sum + img[d as Name].width, 0);
    let x = (F.WIDTH - w) / 2;
    for (const d of digits) {
      ctx.drawImage(img[d as Name], x, F.HEIGHT * 0.1);
      x += img[d as Name].width;
    }
  }

  if (overlay === "ready") ctx.drawImage(img.message, (F.WIDTH - img.message.width) / 2, F.HEIGHT * 0.12);
  if (overlay === "gameover") ctx.drawImage(img.gameover, (F.WIDTH - img.gameover.width) / 2, F.HEIGHT * 0.3);
}
