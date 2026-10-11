import { Arrow, Bar, Box, Label, Sketch } from "./Sketch";

export function OverviewDiagram() {
  return (
    <Sketch w={800} h={320} label="Game sends state to Jev or the GX10 gateway, gets back action probabilities, and acts">
      <Box x={30} y={115} w={160} h={80} color="blue" title="Game" sub="in your browser" />
      <Label x={255} y={155} size={15} color="gray">state +</Label>
      <Label x={255} y={173} size={15} color="gray">question</Label>
      <Arrow pts={[[195, 140], [320, 75]]} />
      <Arrow pts={[[195, 170], [320, 240]]} />
      <Box x={325} y={40} w={180} h={70} color="green" title="Jev" sub="TypeSafe API" />
      <Box x={325} y={205} w={180} h={70} color="purple" title="GX10 gateway" sub="our models" />
      <Arrow pts={[[510, 75], [590, 140]]} />
      <Arrow pts={[[510, 240], [590, 170]]} />
      <Box x={595} y={115} w={175} h={80} color="orange" title="p(action)" sub="flap 0.9 · wait 0.1" />
      <Arrow pts={[[682, 200], [682, 290], [110, 290], [110, 200]]} dashed />
      <Label x={396} y={308} size={15} color="gray">act, next frame</Label>
    </Sketch>
  );
}

export function DataDiagram() {
  return (
    <Sketch w={800} h={150} label="An expert bot looks ahead in the engine and writes labeled JSONL for training">
      <Box x={20} y={40} w={150} h={70} color="blue" title="Engine" sub="same as browser" />
      <Arrow pts={[[175, 75], [235, 75]]} />
      <Box x={240} y={40} w={170} h={70} color="green" title="Expert bot" sub="looks ahead" />
      <Arrow pts={[[415, 75], [475, 75]]} />
      <Box x={480} y={40} w={170} h={70} title="JSONL" sub="state · label" />
      <Arrow pts={[[655, 75], [715, 75]]} />
      <Label x={750} y={75}>train</Label>
    </Sketch>
  );
}

export function LogitsDiagram() {
  return (
    <Sketch w={800} h={200} label="A frozen LLM reads the prompt; its scores for each option token become probabilities">
      <Box x={20} y={45} w={190} h={110} />
      <Label x={115} y={75}>prompt</Label>
      <Label x={115} y={115} size={14} color="gray">state · question</Label>
      <Label x={115} y={135} size={14} color="gray">options: flap, wait</Label>
      <Arrow pts={[[215, 100], [275, 100]]} />
      <Box x={280} y={60} w={160} h={80} color="gray" title="Qwen3-4B" sub="frozen" />
      <Arrow pts={[[445, 100], [505, 100]]} />
      <Label x={555} y={70} size={16} anchor="end">flap</Label>
      <Bar x={565} y={62} w={130} />
      <Label x={555} y={110} size={16} anchor="end">wait</Label>
      <Bar x={565} y={102} w={30} />
      <Label x={630} y={155} size={14} color="gray">next-token scores</Label>
    </Sketch>
  );
}

export function LoraDiagram() {
  return (
    <Sketch w={800} h={200} label="State and options go in as one text; a LoRA and a choice head are trained on a frozen Qwen">
      <Box x={20} y={60} w={160} h={80} title="one text" sub="state + options" />
      <Arrow pts={[[185, 100], [245, 100]]} />
      <Box x={250} y={40} w={210} h={120} color="gray" />
      <Label x={355} y={65}>Qwen</Label>
      <Box x={290} y={90} w={130} h={46} color="orange" title="LoRA" />
      <Arrow pts={[[465, 100], [525, 100]]} />
      <Box x={530} y={60} w={120} h={80} color="orange" title="choice" sub="head" />
      <Arrow pts={[[655, 100], [715, 100]]} />
      <Label x={750} y={100}>p</Label>
    </Sketch>
  );
}

export function ClmDiagram() {
  return (
    <Sketch w={800} h={290} label="State and each action are encoded separately; the closest action vector wins; action vectors are cached">
      <Box x={20} y={40} w={150} h={60} title="state text" />
      <Box x={20} y={190} w={150} h={60} title="action texts" />
      <Arrow pts={[[175, 70], [245, 70]]} />
      <Arrow pts={[[175, 220], [245, 220]]} />
      <Box x={250} y={30} w={150} h={230} color="gray" title="Qwen3-8B" sub="frozen" />
      <Arrow pts={[[405, 70], [465, 70]]} />
      <Arrow pts={[[405, 220], [465, 220]]} />
      <Box x={470} y={40} w={130} h={60} color="orange" title="state head" />
      <Box x={470} y={190} w={130} h={60} color="orange" title="action head" />
      <Box x={455} y={178} w={160} h={100} color="gray" dashed fill={false} />
      <Label x={535} y={267} size={14} color="gray">cached</Label>
      <Arrow pts={[[605, 70], [665, 130]]} />
      <Arrow pts={[[605, 220], [665, 160]]} />
      <Box x={670} y={115} w={110} h={60} color="purple" title="cos" sub="closest wins" />
    </Sketch>
  );
}

export function VisionDiagram() {
  return (
    <Sketch w={800} h={200} label="A vision model sees there is a pipe but cannot tell where the pipe or bird is">
      <Box x={20} y={30} w={180} h={140} color="blue" />
      <Box x={130} y={30} w={34} h={50} color="green" />
      <Box x={130} y={120} w={34} h={50} color="green" />
      <Box x={60} y={90} w={22} h={18} color="orange" />
      <Label x={110} y={185} size={14} color="gray">pixels</Label>
      <Arrow pts={[[205, 100], [265, 100]]} />
      <Box x={270} y={60} w={160} h={80} color="gray" title="Qwen-VL" />
      <Arrow pts={[[435, 85], [505, 60]]} />
      <Arrow pts={[[435, 115], [505, 140]]} />
      <Label x={515} y={60} anchor="start" color="green">pipe? yes</Label>
      <Label x={515} y={140} anchor="start" color="red">where? no idea</Label>
    </Sketch>
  );
}
