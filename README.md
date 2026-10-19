# AI Web Fetcher

A small JavaScript tool that lets an AI model browse the web: open pages, read text,
follow links, fill in forms, submit them (GET and POST), go back, and keep cookies
between requests. The tool itself needs no API key. The AI model you connect it to does.

## Setup

Requires Node.js 18.14 or newer.

```bash
npm install
export ANTHROPIC_API_KEY=your-key   # from console.anthropic.com
npm run agent -- "Open https://example.com and summarize it"
```

On Windows PowerShell use `$env:ANTHROPIC_API_KEY="your-key"`.
To use a different Claude model, set `MODEL`, e.g. `MODEL=claude-sonnet-5-5`.

## Using it from your own code

```js
import Anthropic from "@anthropic-ai/sdk";
import { BrowserSession } from "./src/fetcher.js";
import { toolDefinitions, createToolExecutor } from "./src/tools.js";

const session = new BrowserSession();
const runTool = createToolExecutor(session);
// Pass toolDefinitions as `tools` and runTool(name, input) for each tool_use block.
```

`src/tools.js` exports the tool definitions in the Anthropic format. Other providers
accept nearly the same shape (name, description, JSON schema), so you can adapt them.

## Limits

- JavaScript is not executed, so pages that build their content with scripts will show less.
- File uploads are not supported.
- Cookies are kept per site in a simplified way.
- Respect each site's terms of service and robots.txt, and do not use this to overload servers.
