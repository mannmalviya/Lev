import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Playground · System 1 Playground" };

const GAMES = [
  { href: "/play/flappy", name: "Flappy Bird", img: "/sprites/flappy/message.png", blurb: "Flap or wait. 30 FPS, one decision every 3 frames.", fill: "bg-fill-blue" },
  { href: "/play/dino", name: "Dino Runner", img: "/sprites/dino/sprite-1x.png", blurb: "Jump, duck or run. Cactuses, then pterodactyls.", fill: "bg-fill-green" },
];

export default function PlayPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-hand text-4xl">Pick a game</h1>
      <p className="max-w-2xl">
        Every game is a race: <b className="text-purple">Jev</b>, a <b className="text-blue">baseline LLM</b> that writes its
        answer as text, and <b className="text-orange">our System 1 model</b> running on the GX10. All lanes get the same seed.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link key={g.href} href={g.href} className={`sketch ${g.fill} block p-5 transition-transform hover:-rotate-1`}>
            <div className="font-hand text-2xl">{g.name}</div>
            <div className="mt-1 text-muted">{g.blurb}</div>
          </Link>
        ))}
        <div className="sketch-soft p-5 text-muted">
          <div className="font-hand text-2xl">Tetris</div>
          <div className="mt-1">Coming later.</div>
        </div>
      </div>
    </div>
  );
}
