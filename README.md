**Describe the bug**

Genkit 1.39.0 agent API (`definePromptAgent()`) returns the following error when output schema is provided.

A prompt agent whose prompt declares a structured `output` schema throws on the
very first `send()`:

```
AgentError: (message) => {
        return extractJson(message.text);
      } could not be cloned.
  ... DOMException [DataCloneError] ... at structuredClone (node:internal/worker/js_transferable)
  at AgentChatImpl.toAgentError (@genkit-ai/ai/src/agent-core.ts:985)
  at @genkit-ai/ai/src/agent-core.ts:754
```

**To Reproduce**

Clone, npm install, and run the [example repo here](https://github.com/jmcooper/genkit-agent-api-error-repro) which does the following:

```ts
ai.definePrompt(
  {
    name: 'echoPrompt',
    model,
    output: { schema: z.object({ answer: z.string() }) }, // <-- remove this line and the error goes away
  },
  'You are a test assistant.',
);

// A prompt agent backed by a session store.
const agent = ai.definePromptAgent({
  promptName: 'echoPrompt',
  store: new InMemorySessionStore(),
});
```

**Expected behavior**

It should support specifying an output schema when using the agent API and return a response matching the schema.

**Desktop (please complete the following information):**
- OS: Windows
- Bash Terminal
- `genkit` **1.39.0** (JS), `genkit/beta`
- Node.js 24.x
- Models tested:
  - Fake in-process model: No plugin, no API key, no network — reproduced with a fake in-process model
  - gemini-3.1-flash-lite
  - gemini-3-flash-preview

## To run the sample repo

### Using a fake inline model:
```bash
npm install
npm run repro
```

### Using a real model:
To use a real model set the following values in the `.env` (see `.env.sample`) before running the project as described above: 
- Set `USE_REAL_MODEL=true`
- Set `GEMINI_API_KEY`
- Set `GEMINI_MODEL_NAME` (i.e. `GEMINI_MODEL_NAME='gemini-3.5-flash'`)


## Expected
`chat.send()` resolves and `res.output` is `{ answer: 'hello' }`.

## Actual
Throws `AgentError` wrapping a `DataCloneError` from `structuredClone`.

## Isolating variable
Deleting the single `output: { schema }` line makes it run to completion. So the
crash is triggered specifically by combining a **prompt agent** with a
**structured output schema**.

Also isolated (all still crash / all irrelevant):
- **Model** — reproduced with the fake model above, and with `gemini-2.5-flash`,
  `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-3.5-flash`.
- **Session store** — crashes with `InMemorySessionStore`, `FileSessionStore`,
  and even with **no store** (ephemeral `agent.chat()` / client-managed state).
- **The plain API is fine** — `ai.generate({ output: { schema } })` and
  `ai.prompt(...).stream(input, { ... })` with the *same* output schema work
  perfectly. Only the Agent path fails.

## Likely root cause
The JSON output format (`@genkit-ai/ai/src/formats/json.ts`) returns a format
object holding functions (`parseMessage = (message) => extractJson(message.text)`,
`parseChunk`). The Agent turn machinery `structuredClone`s session state that
transitively references that format object (e.g. state diffing around
`agent.ts:1201/1214`, `session.ts:164/174/184`), and `structuredClone` cannot
clone a function → `DataCloneError`.

## Workaround
Don't set a native `output` schema on an agent's prompt. Instruct the model to
emit JSON in the prompt text and parse it yourself from `response.text`. That
avoids attaching the format functions and works with agents + sessions.
