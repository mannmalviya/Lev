import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-10 pt-6">
      <section className="space-y-4">
        <p className="font-hand text-sm uppercase tracking-[0.3em] text-muted">UCSC AI Hackathon · Local AI</p>
        <h1 className="font-hand text-5xl leading-tight sm:text-6xl">
          Fast decisions,
          <br />
          <span className="text-orange">on your own hardware.</span>
        </h1>
        <p className="max-w-2xl text-xl">
          A <i>System 1 model</i> does not write text. It reads a situation and a list of choices, and returns a probability
          for each choice in one pass. Jev made the idea popular, but it is closed. We train our own small open models, run them
          on an ASUS GX10, and race them against Jev in real games.
        </p>
        <div className="flex flex-wrap gap-3 font-hand text-xl">
          <Link href="/play" className="sketch bg-fill-orange px-5 py-2 hover:bg-orange hover:text-white">Open the playground →</Link>
          <Link href="/approach" className="sketch-soft px-5 py-2 hover:bg-fill-gray">How it works</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "One pass", d: "State + options in, probabilities out. No tokens to generate.", c: "bg-fill-blue" },
          { t: "Same seed", d: "Every lane plays the exact same pipes and cactuses.", c: "bg-fill-green" },
          { t: "Local", d: "Our models answer from a GX10 on the desk, not a data center.", c: "bg-fill-purple" },
        ].map((x) => (
          <div key={x.t} className={`sketch ${x.c} p-4`}>
            <div className="font-hand text-2xl">{x.t}</div>
            <div className="text-muted">{x.d}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
