import type { Metadata } from "next";
import Race from "@/components/Race";

export const metadata: Metadata = { title: "Dino Runner · System 1 Playground" };

export default function DinoPage() {
  return (
    <Race gameId="dino" title="Dino Runner" />
  );
}
