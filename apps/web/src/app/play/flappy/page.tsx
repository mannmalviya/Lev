import type { Metadata } from "next";
import Race from "@/components/Race";

export const metadata: Metadata = { title: "Flappy Bird · System 1 Playground" };

export default function FlappyPage() {
  return (
    <Race gameId="flappy" title="Flappy Bird" />
  );
}
