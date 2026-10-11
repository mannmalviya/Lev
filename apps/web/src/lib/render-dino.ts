// Draws a DinoState like Chrome's offline dino game, from the 2x sprite sheet.
// Clouds and horizon bumps are cosmetic and derived from the frame/seed, not simulated.

import { DINO, type DinoState } from "@s1/engine";

const D = DINO;

// Runner.spriteDefinition.HDPI from Chromium's offline.js. Sizes below are 1x and get doubled.
const POS = {
  CACTUS_LARGE: { x: 652, y: 2 },
  CACTUS_SMALL: { x: 446, y: 2 },
  CLOUD: { x: 166, y: 2 },
  HORIZON: { x: 2, y: 104 },
  PTERODACTYL: { x: 260, y: 2 },
  RESTART: { x: 2, y: 2 },
  TEXT_SPRITE: { x: 1294, y: 2 },
  TREX: { x: 1678, y: 2 },
};
const SIZE = {
  CACTUS_SMALL: { w: 17, h: 35 },
  CACTUS_LARGE: { w: 25, h: 50 },
  PTERODACTYL: { w: 46, h: 40 },
};

let cache: Promise<HTMLImageElement> | null = null;
export function loadDinoSprite(): Promise<HTMLImageElement> {
  cache ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "/sprites/dino/sprite-2x.png";
  });
  return cache;
}

/** Draw a 1x-sized piece of the 2x sheet. */
function blit(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement, sx: number, sy: number, w: number, h: number, dx: number, dy: number, dw = w, dh = h) {
  ctx.drawImage(sprite, sx, sy, w * 2, h * 2, Math.round(dx), Math.round(dy), dw, dh);
}

export function drawDino(ctx: CanvasRenderingContext2D, s: DinoState, sprite: HTMLImageElement, overlay: "ready" | "gameover" | null) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f7f7f7";
  ctx.fillRect(0, 0, D.WIDTH, D.HEIGHT);

  // Clouds: three slow layers that wrap around.
  for (let i = 0; i < 3; i++) {
    const span = D.WIDTH + 46 + 150;
    const x = D.WIDTH - ((s.distance * 0.2 + i * 260 + (s.rng.seed % 97)) % span);
    blit(ctx, sprite, POS.CLOUD.x, POS.CLOUD.y, 46, 14, x, 30 + ((i * 23) % 40));
  }

  // Horizon: two 600px segments, flat or bumpy chosen per segment index.
  const offset = ((-s.groundX % D.WIDTH) + D.WIDTH) % D.WIDTH;
  const segment = Math.floor(-s.groundX / D.WIDTH);
  for (let k = 0; k < 2; k++) {
    const bumpy = ((segment + k) * 2654435761) % 7 > 3;
    blit(ctx, sprite, POS.HORIZON.x + (bumpy ? D.WIDTH * 2 : 0), POS.HORIZON.y, D.WIDTH, 12, k * D.WIDTH - offset, 127);
  }

  for (const o of s.obstacles) {
    const size = SIZE[o.type];
    let sx = POS[o.type].x + size.w * 2 * o.size * (0.5 * (o.size - 1));
    if (o.type === "PTERODACTYL") sx += size.w * 2 * (Math.floor(s.frame / 10) % 2);
    blit(ctx, sprite, sx, POS[o.type].y, size.w * o.size, size.h, o.x, o.y);
  }

  const t = s.trex;
  let frameX: number;
  let width: number = D.TREX_W;
  if (s.over) frameX = 220;
  else if (overlay === "ready") frameX = 44;
  else if (t.jumping) frameX = 0;
  else if (t.ducking) {
    frameX = [264, 323][Math.floor(s.frame / 8) % 2];
    width = D.TREX_W_DUCK;
  } else frameX = [88, 132][Math.floor(s.frame / 5) % 2];
  blit(ctx, sprite, POS.TREX.x + frameX * 2, POS.TREX.y, width, D.TREX_H, D.TREX_X, t.y);

  // Distance meter: five digits at the top right.
  const score = String(Math.min(99999, Math.round(s.distance * D.DISTANCE_COEFFICIENT))).padStart(5, "0");
  const startX = D.WIDTH - 11 * 6;
  score.split("").forEach((d, i) => blit(ctx, sprite, POS.TEXT_SPRITE.x + Number(d) * 20, POS.TEXT_SPRITE.y, 10, 13, startX + i * 11, 5));

  if (overlay === "gameover") {
    blit(ctx, sprite, POS.TEXT_SPRITE.x, POS.TEXT_SPRITE.y + 26, 191, 11, (D.WIDTH - 191) / 2, Math.round((D.HEIGHT - 25) / 3));
    blit(ctx, sprite, POS.RESTART.x, POS.RESTART.y, 36, 32, (D.WIDTH - 36) / 2, D.HEIGHT / 2);
  }
}
