import type { Metadata } from "next";

export const metadata: Metadata = { title: "Approach · System 1 Playground" };

const STEPS = [
  { n: "01", t: "Read the logits", d: "No training. Ask an open model the question and read the scores of each option token. Our zero-shot floor." },
  { n: "02", t: "LoRA + choice head", d: "Kev-style: a small LoRA adapter plus a pointer head on Qwen. State and options go in as one text." },
  { n: "03", t: "Contrastive (CLM)", d: "State and each action become vectors. The closest action wins. Action vectors are cached." },
  { n: "04", t: "Vision", d: "A System 1 model that reads pixels instead of a text state." },
];

export default function ApproachPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-hand text-4xl">Approach</h1>
      <p className="max-w-2xl">
        The games run in your browser. Each lane sends the game state and the question to a model, and gets back one probability
        per action. Training data comes from a lookahead expert bot playing the same engine.
      </p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="sketch p-4">
            <div className="font-hand text-orange">{s.n}</div>
            <div className="font-hand text-2xl">{s.t}</div>
            <div className="text-muted">{s.d}</div>
          </li>
        ))}
      </ol>
      <p className="font-hand text-muted">More detail coming soon.</p>
    </div>
  );
}
