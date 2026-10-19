// Example: an AI model (Claude) uses the web tools to complete a task.
// Usage: ANTHROPIC_API_KEY=your-key node agent.js "What is on example.com?"

import Anthropic from "@anthropic-ai/sdk";
import { BrowserSession } from "./src/fetcher.js";
import { toolDefinitions, createToolExecutor } from "./src/tools.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first (get one at console.anthropic.com).");
  process.exit(1);
}

const model = process.env.MODEL ?? "claude-haiku-5-5";
const task = process.argv.slice(2).join(" ") || "Open https://example.com and tell me what it says.";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const session = new BrowserSession();
const runTool = createToolExecutor(session);
const messages = [{ role: "user", content: task }];

for (let step = 0; step < 20; step++) {
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system:
      "You can browse the web with the provided tools. Use them to complete the user's request, then give a concise final answer.",
    tools: toolDefinitions,
    messages,
  });

  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason !== "tool_use") {
    for (const block of response.content) {
      if (block.type === "text") console.log(block.text);
    }
    break;
  }

  const results = [];
  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    console.log(`[tool] ${block.name} ${JSON.stringify(block.input)}`);
    try {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: await runTool(block.name, block.input),
      });
    } catch (err) {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: ${err.message}`,
        is_error: true,
      });
    }
  }
  messages.push({ role: "user", content: results });
}
