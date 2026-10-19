import * as cheerio from "cheerio";

const USER_AGENT = "Mozilla/5.0 (compatible; AIWebFetcher/1.0)";
const TIMEOUT_MS = 20000;

/** Parse an HTML page into title, readable text, links and forms. */
function parsePage(url, html) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim();

  const $body = cheerio.load(html);
  $body("script, style, noscript").remove();
  const text = $body("body")
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  const links = [];
  $("a[href]").each((_, el) => {
    let absolute;
    try {
      absolute = new URL($(el).attr("href"), url).href;
    } catch {
      return;
    }
    if (!/^https?:/i.test(absolute)) return;
    links.push({ text: $(el).text().replace(/\s+/g, " ").trim(), url: absolute });
  });

  const forms = [];
  $("form").each((_, formEl) => {
    const $form = $(formEl);
    const fields = [];
    $form.find("input, textarea, select").each((_, el) => {
      const $el = $(el);
      const name = $el.attr("name");
      const tag = el.tagName.toLowerCase();
      if (tag === "input") {
        const type = ($el.attr("type") || "text").toLowerCase();
        if (["submit", "button", "image", "reset", "file"].includes(type)) return;
        const checkable = type === "checkbox" || type === "radio";
        fields.push({
          name,
          type,
          value: $el.attr("value") ?? (checkable ? "on" : ""),
          checked: $el.attr("checked") !== undefined,
        });
      } else if (tag === "textarea") {
        fields.push({ name, type: "textarea", value: $el.text(), checked: false });
      } else if (tag === "select") {
        const $selected = $el.find("option[selected]").first();
        const $option = $selected.length ? $selected : $el.find("option").first();
        fields.push({
          name,
          type: "select",
          value: $option.attr("value") ?? $option.text().trim(),
          checked: false,
        });
      }
    });
    forms.push({
      method: ($form.attr("method") || "get").toLowerCase(),
      action: $form.attr("action") || "",
      fields,
    });
  });

  return { url, title, text, links, forms };
}

/** Merge Set-Cookie headers into an existing "a=1; b=2" cookie string. */
function mergeCookies(existing, setCookieHeaders) {
  const jar = new Map();
  for (const pair of (existing ?? "").split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) jar.set(key, rest.join("="));
  }
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";");
    const [key, ...rest] = pair.split("=");
    if (key) jar.set(key.trim(), rest.join("=").trim());
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * A browsing session: keeps the current page, history, cookies and
 * unsubmitted form values, the way a simple browser would.
 * Form and link numbers are 1-based.
 */
export class BrowserSession {
  constructor() {
    this.cookies = new Map(); // host -> cookie string
    this.page = null;
    this.history = [];
    this.formValues = new Map(); // form number -> { fieldName: value }
  }

  async open(url) {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (this.page) this.history.push(this.page.url);
    return this.#load(url);
  }

  async click(n) {
    const link = this.#require().links[n - 1];
    if (!link) throw new Error(`no link ${n} (page has ${this.page.links.length})`);
    this.history.push(this.page.url);
    return this.#load(link.url, { referer: this.page.url });
  }

  fill(formNumber, name, value) {
    const form = this.#form(formNumber);
    if (!form.fields.some((f) => f.name === name)) {
      const names = form.fields.map((f) => f.name).filter(Boolean);
      throw new Error(`form ${formNumber} has no field "${name}". Fields: ${names.join(", ") || "none"}`);
    }
    const values = this.formValues.get(formNumber) ?? {};
    values[name] = value;
    this.formValues.set(formNumber, values);
  }

  async submit(formNumber) {
    const page = this.#require();
    const form = this.#form(formNumber);
    const data = new URLSearchParams();
    for (const field of form.fields) {
      if (!field.name) continue;
      if ((field.type === "checkbox" || field.type === "radio") && !field.checked) continue;
      data.append(field.name, field.value ?? "");
    }
    for (const [name, value] of Object.entries(this.formValues.get(formNumber) ?? {})) {
      data.set(name, value);
    }

    const action = new URL(form.action || "", page.url);
    this.history.push(page.url);
    if (form.method === "post") {
      return this.#load(action.href, { method: "POST", body: data.toString(), referer: page.url });
    }
    action.search = data.toString();
    return this.#load(action.href, { referer: page.url });
  }

  async back() {
    if (!this.history.length) throw new Error("no previous page");
    return this.#load(this.history.pop());
  }

  describe() {
    const p = this.#require();
    return `Title: ${p.title || "(none)"}\nURL: ${p.url}\n${p.links.length} links, ${p.forms.length} forms.`;
  }

  // ---- internals ----

  async #load(url, { method = "GET", body, referer } = {}) {
    const host = new URL(url).host;
    const headers = { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" };
    if (this.cookies.has(host)) headers.Cookie = this.cookies.get(host);
    if (referer) headers.Referer = referer;
    if (body !== undefined) headers["Content-Type"] = "application/x-www-form-urlencoded";

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      this.cookies.set(host, mergeCookies(this.cookies.get(host), setCookies));
    }

    const html = await res.text();
    this.page = parsePage(res.url, html);
    this.formValues.clear();
    return this.page;
  }

  #require() {
    if (!this.page) throw new Error("no page open yet - use open_page first");
    return this.page;
  }

  #form(n) {
    const page = this.#require();
    const form = page.forms[n - 1];
    if (!form) throw new Error(`no form ${n} (page has ${page.forms.length})`);
    return form;
  }
}
