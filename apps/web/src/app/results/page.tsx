import type { Metadata } from "next";

export const metadata: Metadata = { title: "Results · System 1 Playground" };

export default function ResultsPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-hand text-4xl">Results</h1>
      <p className="max-w-2xl">
        Charts from our offline evaluation runs will go here: score, latency on the GX10, and calibration for each model size.
      </p>
      <div className="sketch-soft p-8 text-center font-hand text-xl text-muted">Coming soon</div>
    </div>
  );
}
