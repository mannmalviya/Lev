
# Ways to build System I Models:

1. **Read the logits**
   - No/Zero Training
   - Ask the Model a question
   - Read the scores it gives to each choice token
   - (Logits = the raw scores before it picks a word)
   - This is how **OpenJev** works
   - This is our baseline

2. **LoRA plus a small choice head**
   - LoRA is a small add-on that trains only a few weights.
   - This is how **Kev** works
     - Rank-16 LoRA plus a small pointer head on Qwen3.5 at 0.8B, 4B and 9B
   - Input: State and Choices in one text
   - What it trains: LoRA + head
   - Data: ~12.6k examples (uhh where did this number come from?)
   - Good at: small, fixed choice lists  (how do u know?)
   - Weak at: many choices (cost grows)  (how do u know?)

3. **CLM**
   - Contrastive method:
     - Learns to put each state close to it's correct action.
     - Teammate running tests on this
     - Input: State and actions in separate texts
     - What it trains: 20M head only
     - Data: ~90M pairs (uhh where did this number come from?)
     - Good at: Big or changing action lists, because action cards can be saved and reused (How do you know?)
     - Weak at: Fine detail, because state and action meet only at the end (How do you know?)

4. **Vision**
   - Trying to make a System 1 model that has vision.
  

