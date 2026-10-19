/**
 * Tool definitions in the format used by the Anthropic Messages API tool use.
 * Other AI providers use nearly the same shape (name, description, JSON schema).
 */
export const toolDefinitions = [
  {
    name: "open_page",
    description:
      "Open a web page by URL. Returns the title, URL and a count of links and forms. Use read_page_text to see the content.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "Full URL, e.g. https://example.com" } },
      required: ["url"],
    },
  },
  {
    name: "read_page_text",
    description: "Return the readable text of the current page (truncated if very long).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_links",
    description: "List the links on the current page, each with a number you can pass to click_link.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "click_link",
    description: "Follow a link on the current page by its number from list_links.",
    input_schema: {
      type: "object",
      properties: { number: { type: "integer", description: "Link number from list_links" } },
      required: ["number"],
    },
  },
  {
    name: "list_forms",
    description: "List the forms on the current page with their numbers and field names.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "fill_form_field",
    description: "Set a value in a form field before submitting the form.",
    input_schema: {
      type: "object",
      properties: {
        form_number: { type: "integer", description: "Form number from list_forms" },
        name: { type: "string", description: "Field name from list_forms" },
        value: { type: "string" },
      },
      required: ["form_number", "name", "value"],
    },
  },
  {
    name: "submit_form",
    description:
      "Submit a form on the current page with its filled values (GET or POST). The result is the new page.",
    input_schema: {
      type: "object",
      properties: { form_number: { type: "integer", description: "Form number from list_forms" } },
      required: ["form_number"],
    },
  },
  {
    name: "go_back",
    description: "Go back to the previously viewed page.",
    input_schema: { type: "object", properties: {} },
  },
];

const MAX_TEXT = 8000;

/** Returns a function run(name, input) -> string that executes a tool call. */
export function createToolExecutor(session) {
  return async function run(name, input = {}) {
    switch (name) {
      case "open_page":
        await session.open(input.url);
        return session.describe();

      case "read_page_text": {
        if (!session.page) throw new Error("no page open yet - use open_page first");
        const text = session.page.text;
        return text.length > MAX_TEXT
          ? text.slice(0, MAX_TEXT) + "\n...[truncated]"
          : text || "(no text)";
      }

      case "list_links":
        if (!session.page.links.length) return "No links on this page.";
        return session.page.links
          .map((l, i) => `${i + 1}. ${l.text.slice(0, 80) || "(no text)"} -> ${l.url}`)
          .join("\n");

      case "click_link":
        await session.click(input.number);
        return session.describe();

      case "list_forms":
        if (!session.page.forms.length) return "No forms on this page.";
        return session.page.forms
          .map((f, i) => {
            const fields = f.fields.map((x) => `${x.name || "(unnamed)"} [${x.type}]`).join(", ");
            return `Form ${i + 1}: ${f.method.toUpperCase()} ${f.action || "(this page)"}\n  fields: ${fields || "none"}`;
          })
          .join("\n");

      case "fill_form_field":
        session.fill(input.form_number, input.name, input.value);
        return `Set ${input.name} on form ${input.form_number}.`;

      case "submit_form":
        await session.submit(input.form_number);
        return session.describe();

      case "go_back":
        await session.back();
        return session.describe();

      default:
        throw new Error(`unknown tool: ${name}`);
    }
  };
}
