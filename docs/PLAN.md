
We are building a hackathon project for the local AI track at UCSC AI Hackathon.

We are building our own System 1 model that can run locally. We will be running those on a ASUS GX10.

look at @APPROACHES.md which contains all the methods we will try for our own local system 1 models.

We will then make a hosted website on vercel called "System 1 Playground", in which we will show a comparison of our System 1 model, Jev and a baseline LLM being one shotted, to play games like: Flappy Bird, Dino Runner and Tetris.

We will have different pages on the website one of them will be playground(all the games to chose from) and there will be another page describing the approch that we hve taken etc etc.


 Judge's browser (site on Vercel)
   │
   │  game loop runs here, in the browser
   │
   ├── our models ──HTTPS──► tunnel ──► GX10 (localhost:8000)  /v1/systemone
   │
   └── Jev ──► Vercel API route ──► TypeSafe API   (key stays on the server)

 
Does the API need two inputs for CLM?

No. The API says what to answer. It does not say how the model works inside.

The request already keeps the state and the options apart. Each model has a small adapter that converts the request into its own input:

┌─────────────┬────────────────────────────────────────────────┐
│    Model    │             What its adapter does              │
├─────────────┼────────────────────────────────────────────────┤
│ Baseline    │ Join the state and the options into one        │
│ LLM         │ prompt. Read the option-letter logits.         │
├─────────────┼────────────────────────────────────────────────┤
│ LoRA +      │ Join them into one prompt, with option         │
│ choice head │ markers. Run the head.                         │
├─────────────┼────────────────────────────────────────────────┤
│             │ Send state to the state head. Send each option │
│ CLM         │  ("flap: Jump up") to the action head. Take    │
│             │ the dot product.                               │
├─────────────┼────────────────────────────────────────────────┤
│ Jev         │ Pass the request through unchanged.            │
└─────────────┴────────────────────────────────────────────────┘

So the API stays one shape. The differences stay hidden in the adapters.



