import type { Metadata } from "next";
import {
  ClmDiagram,
  DataDiagram,
  LogitsDiagram,
  LoraDiagram,
  OverviewDiagram,
  VisionDiagram,
} from "@/components/ApproachDiagrams";

export const metadata: Metadata = { title: "Approach · System 1 Playground" };

const STEPS = [
  { n: "01", t: "Read the logits", d: "No training. Read each option's score. Our floor.", Diagram: LogitsDiagram },
  { n: "02", t: "LoRA + choice head", d: "Kev-style. Train a small add-on and a head.", Diagram: LoraDiagram },
  { n: "03", t: "Contrastive (CLM)", d: "Closest action vector wins.", Diagram: ClmDiagram },
  { n: "04", t: "Vision", d: "Reads pixels. Sees things, not where they are.", Diagram: VisionDiagram },
];

export default function ApproachPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="font-hand text-4xl">Approach</h1>
        <p className="max-w-2xl">Each lane asks a model one question per frame and gets one probability per action.</p>
        <div className="max-w-3xl">
          <OverviewDiagram />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-hand text-2xl">Training data</h2>
        <div className="max-w-3xl">
          <DataDiagram />
        </div>
      </section>

      <section className="space-y-6">
        <p className="font-hand text-muted">
          <span className="text-orange">orange</span> = trained · gray = frozen
        </p>
        {STEPS.map(({ n, t, d, Diagram }) => (
          <div key={n} className="space-y-1">
            <div className="font-hand text-orange">{n}</div>
            <h2 className="font-hand text-2xl">{t}</h2>
            <p className="text-muted">{d}</p>
            <div className="max-w-3xl">
              <Diagram />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
