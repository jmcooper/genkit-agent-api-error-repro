/**
 * Minimal reproduction: a prompt agent (definePromptAgent) whose prompt declares
 * a structured `output` schema throws the error:
 *
 *   "(message) => { return extractJson(message.text); } could not be cloned."
 *
 * This error is thrown on the on the first `send()`. Remove the `output` schema 
 * and it works fine.
 * 
 * API key and network are OPTIONAL — it optionally uses a fake, 
 * offline model. In .env, set USE_REAL_MODEL=true and set the GEMINI key 
 * and model to reproduce this against a real model.
 *
 * genkit 1.39.0.  Run: npm install && npm run repro
 */
import 'dotenv/config';
import { genkit, z, InMemorySessionStore } from 'genkit/beta';
import { googleAI } from '@genkit-ai/google-genai';

// Configuration (see .env)
// Set USE_REAL_MODEL=true in .env to reproduce against a real Gemini model
// instead of the fake offline model. Requires GEMINI_API_KEY to be set too.
const USE_REAL_MODEL = process.env.USE_REAL_MODEL === 'true';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const MODEL_NAME = process.env.GEMINI_MODEL_NAME ?? 'gemini-3.5-flash';

const ai = genkit({
  plugins: USE_REAL_MODEL
    ? [googleAI({ apiKey: GEMINI_API_KEY })]
    : [],
});

// A fake, offline model that always returns a fixed JSON string.
const echo = ai.defineModel({ name: 'echo' }, async () => ({
  finishReason: 'stop',
  message: { role: 'model', content: [{ text: '{"answer":"hello"}' }] },
}));

// Use the real Gemini model, or fall back to the fake offline one.
const model = USE_REAL_MODEL ? googleAI.model(MODEL_NAME) : echo;

// A prompt that requests structured output.
ai.definePrompt(
  {
    name: 'echoPrompt',
    model,
    output: { schema: z.object({ answer: z.string() }) }, // <-- remove this line and it works
  },
  'You are a test assistant.',
);

// A prompt agent backed by a session store.
const agent = ai.definePromptAgent({
  promptName: 'echoPrompt',
  store: new InMemorySessionStore(),
});

const chat = agent.chat({ sessionId: 'repro-1' });
const res = await chat.send('hi'); // throws: "... could not be cloned"
console.log('output:', res.output);
