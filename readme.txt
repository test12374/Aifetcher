AI WEB FETCHER - HOW TO USE
===========================

This tool lets an AI model browse the web: open pages, read the text,
follow links, fill in forms, submit them, and go back. You need a free
Node.js install and an Anthropic API key to run the example.


WHAT YOU NEED
-------------
1. Node.js version 18.14 or newer. Download it from nodejs.org.
2. An Anthropic API key. Get one at console.anthropic.com.
   Keep this key private. Do not paste it into code or share it on GitHub.


STEP 1: INSTALL THE DEPENDENCIES
---------------------------------
Open a terminal in the ai-web-fetcher folder and run:

    npm install

This downloads the two libraries the tool uses (cheerio and the Anthropic SDK).


STEP 2: SET YOUR API KEY
-------------------------
Mac or Linux terminal:

    export ANTHROPIC_API_KEY=your-key-here

Windows PowerShell:

    $env:ANTHROPIC_API_KEY="your-key-here"

Replace your-key-here with your real key. This only lasts for the current
terminal window. Close the window and you will need to set it again.


STEP 3: RUN IT
---------------
Give the AI a task in quotes:

    npm run agent -- "Open https://example.com and tell me what it says"

You will see each step printed as [tool] lines, showing what the AI
opened, clicked, or submitted. The last part is the AI's final answer.

Try a few examples:

    npm run agent -- "Find the first link on https://example.com and open it"
    npm run agent -- "Go to https://news.ycombinator.com and list the top 5 titles"

To use a different Claude model, set MODEL before running:

    MODEL=claude-sonnet-5-5 npm run agent -- "your task"


WHAT THE AI CAN DO (THE TOOLS)
-------------------------------
open_page        Open a web address.
read_page_text   Read the text of the current page.
list_links       List the links on the page, numbered.
click_link       Follow a link by its number.
list_forms       List the forms on the page, numbered, with their fields.
fill_form_field  Type a value into a form field.
submit_form      Submit a form.
go_back          Return to the previous page.


USING THE TOOLS IN YOUR OWN CODE
---------------------------------
See README.md for a short example. The files you will use are:

    src/fetcher.js   the browsing logic
    src/tools.js     the tool definitions the AI sees


TROUBLESHOOTING
---------------
"Set ANTHROPIC_API_KEY first"
    The key is not set in this terminal. Run Step 2 again.

"Cannot find module" or similar
    Run "npm install" again in the ai-web-fetcher folder.

"Error: fetch failed" or a timeout
    The website may be down or blocking automated requests. Try another site.

The AI says a page is empty or missing content
    Many sites build their content with JavaScript, which this tool does not
    run. The tool only sees the HTML the server sends.


LIMITS
------
- It does not run JavaScript, so content loaded by scripts may be missing.
- File uploads are not supported.
- Please respect each site's terms of service and robots.txt, and do not
  send so many requests that you overload a server.
- Each run uses your API key and may cost money, so start with simple tasks.
