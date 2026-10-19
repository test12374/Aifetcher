#!/usr/bin/env python3
"""
web_fetcher.py - fetch a web page and interact with it from the command line.

It can open a URL, read the page text, list and follow links, list forms,
fill in fields, and submit forms (GET or POST), keeping cookies between
requests like a simple browser. It uses only the Python standard library,
so it runs on a PC and in Pyroid. It does not run JavaScript.

Usage:
  python web_fetcher.py [url]

Commands:
  open <url>              fetch a page
  text                    show the readable text of the current page
  links                   list links on the page
  click <n>               follow link number n
  forms                   list forms on the page
  fill <n> name=value     set a field on form n (repeat for more fields)
  submit <n>              submit form n with the values you filled in
  back                    go back to the previous page
  save <file>             save the current page's HTML to a file
  help                    show this help
  quit                    exit
"""

import sys
import urllib.parse
import urllib.request
import http.cookiejar
from html.parser import HTMLParser

USER_AGENT = "Mozilla/5.0 (compatible; WebFetcher/1.0)"
TEXT_LIMIT = 4000


class PageParser(HTMLParser):
    """Collects title, text, links and forms from an HTML page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.text_parts = []
        self.links = []   # list of (text, href)
        self.forms = []   # list of dicts: method, action, fields
        self._in_title = False
        self._skip = 0    # depth inside <script> or <style>
        self._link = None
        self._form = None
        self._select = None
        self._textarea = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "a" and a.get("href"):
            self._link = [a["href"], ""]
        elif tag == "form":
            self._form = {
                "method": (a.get("method") or "get").lower(),
                "action": a.get("action") or "",
                "fields": [],
            }
            self.forms.append(self._form)
        elif tag == "input" and self._form is not None:
            kind = (a.get("type") or "text").lower()
            if kind in ("submit", "button", "image", "reset", "file"):
                return
            self._form["fields"].append({
                "name": a.get("name"),
                "type": kind,
                "value": a.get("value", "on" if kind in ("checkbox", "radio") else ""),
                "checked": "checked" in a,
            })
        elif tag == "textarea" and self._form is not None:
            self._textarea = {"name": a.get("name"), "type": "textarea", "value": ""}
            self._form["fields"].append(self._textarea)
        elif tag == "select" and self._form is not None:
            self._select = {"name": a.get("name"), "type": "select", "value": None}
            self._form["fields"].append(self._select)
        elif tag == "option" and self._select is not None:
            if "value" in a and (self._select["value"] is None or "selected" in a):
                self._select["value"] = a["value"]

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag == "a" and self._link is not None:
            self.links.append((" ".join(self._link[1].split()), self._link[0]))
            self._link = None
        elif tag == "form":
            self._form = None
        elif tag == "select":
            self._select = None
        elif tag == "textarea":
            self._textarea = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._link is not None:
            self._link[1] += data
        if self._textarea is not None:
            self._textarea["value"] += data
        if not self._skip:
            self.text_parts.append(data)


class Page:
    def __init__(self, url, html):
        self.url = url
        self.html = html
        p = PageParser()
        p.feed(html)
        p.close()
        self.title = " ".join(p.title.split())
        lines = [" ".join(line.split()) for line in "".join(p.text_parts).splitlines()]
        self.text = "\n".join(line for line in lines if line)
        self.links = [
            (text, urllib.parse.urljoin(url, href))
            for text, href in p.links
            if urllib.parse.urlparse(urllib.parse.urljoin(url, href)).scheme in ("http", "https")
        ]
        self.forms = p.forms


class WebFetcher:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar))
        self.opener.addheaders = [("User-Agent", USER_AGENT)]
        self.page = None
        self.history = []
        self.form_values = {}   # form index -> {field name: value}

    def _load(self, url, data=None, referer=None):
        headers = {"Referer": referer} if referer else {}
        req = urllib.request.Request(url, data=data, headers=headers)
        with self.opener.open(req, timeout=20) as resp:
            final_url = resp.geturl()
            ctype = resp.headers.get("Content-Type", "")
            raw = resp.read()
        charset = "utf-8"
        if "charset=" in ctype:
            charset = ctype.split("charset=")[-1].split(";")[0].strip()
        try:
            html = raw.decode(charset, errors="replace")
        except LookupError:
            html = raw.decode("utf-8", errors="replace")
        self.page = Page(final_url, html)
        self.form_values = {}
        return self.page

    def open(self, url):
        if not urllib.parse.urlparse(url).scheme:
            url = "https://" + url
        if self.page:
            self.history.append(self.page.url)
        return self._load(url)

    def click(self, n):
        text, href = self._link(n)
        self.history.append(self.page.url)
        return self._load(href, referer=self.page.url)

    def submit(self, n):
        form = self._form(n)
        values = dict(self.form_values.get(n, {}))
        data = {}
        for field in form["fields"]:
            name = field["name"]
            if not name:
                continue
            if field["type"] in ("checkbox", "radio") and not field["checked"]:
                continue
            data[name] = field["value"] or ""
        data.update(values)

        action = urllib.parse.urljoin(self.page.url, form["action"]) or self.page.url
        if form["method"] == "post":
            self.history.append(self.page.url)
            return self._load(action, data=urllib.parse.urlencode(data).encode(),
                              referer=self.page.url)
        parts = urllib.parse.urlparse(action)
        query = urllib.parse.urlencode(data)
        target = urllib.parse.urlunparse(parts._replace(query=query))
        self.history.append(self.page.url)
        return self._load(target, referer=self.page.url)

    def fill(self, n, name, value):
        form = self._form(n)
        names = [f["name"] for f in form["fields"]]
        if name not in names:
            raise ValueError(f"form {n} has no field '{name}'. Fields: {', '.join(filter(None, names)) or 'none'}")
        self.form_values.setdefault(n, {})[name] = value

    def back(self):
        if not self.history:
            raise ValueError("no previous page")
        return self._load(self.history.pop())

    def _link(self, n):
        self._require()
        if not 1 <= n <= len(self.page.links):
            raise ValueError(f"no link {n} (page has {len(self.page.links)})")
        return self.page.links[n - 1]

    def _form(self, n):
        self._require()
        if not 1 <= n <= len(self.page.forms):
            raise ValueError(f"no form {n} (page has {len(self.page.forms)})")
        return self.page.forms[n - 1]

    def _require(self):
        if self.page is None:
            raise ValueError("no page open yet - use: open <url>")


def show_summary(page):
    print(f"\n{page.title or '(no title)'}\n{page.url}")
    print(f"{len(page.links)} links, {len(page.forms)} forms. Type 'text', 'links' or 'forms'.\n")


def main():
    f = WebFetcher()
    if len(sys.argv) > 1:
        try:
            f.open(sys.argv[1])
            show_summary(f.page)
        except Exception as e:
            print("Error:", e)
    print("Type 'help' for commands.")

    while True:
        try:
            line = input("web> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        cmd, *args = line.split()
        try:
            if cmd in ("quit", "exit"):
                break
            elif cmd == "help":
                print(__doc__)
            elif cmd == "open":
                f.open(args[0])
                show_summary(f.page)
            elif cmd == "text":
                f._require()
                out = f.page.text
                print(out[:TEXT_LIMIT] + ("\n...[truncated, use save <file> for all]" if len(out) > TEXT_LIMIT else ""))
            elif cmd == "links":
                f._require()
                for i, (text, href) in enumerate(f.page.links, 1):
                    print(f"{i:>3}. {text[:60] or '(no text)'}  -> {href}")
            elif cmd == "click":
                f.click(int(args[0]))
                show_summary(f.page)
            elif cmd == "forms":
                f._require()
                if not f.page.forms:
                    print("No forms on this page.")
                for i, form in enumerate(f.page.forms, 1):
                    names = [x["name"] or "(unnamed)" for x in form["fields"]]
                    print(f"Form {i}: {form['method'].upper()} {form['action'] or '(this page)'}")
                    print(f"        fields: {', '.join(names) or 'none'}")
            elif cmd == "fill":
                n = int(args[0])
                for pair in args[1:]:
                    name, _, value = pair.partition("=")
                    f.fill(n, name, value)
                print("Filled. Use 'submit", n, "' when ready.")
            elif cmd == "submit":
                f.submit(int(args[0]))
                show_summary(f.page)
            elif cmd == "back":
                f.back()
                show_summary(f.page)
            elif cmd == "save":
                f._require()
                with open(args[0], "w", encoding="utf-8") as fh:
                    fh.write(f.page.html)
                print("Saved to", args[0])
            else:
                print("Unknown command. Type 'help'.")
        except Exception as e:
            print("Error:", e)


if __name__ == "__main__":
    main()
