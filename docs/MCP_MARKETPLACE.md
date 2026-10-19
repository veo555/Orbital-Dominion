# Submitting the MCP server to a marketplace (notes)

What I could verify (from search results, not from the form itself, which my tools could not open): xAI's Grok Bot marketplace accepts a plugin or MCP server for distribution to Grok Bot and Cursor users; Grok support is described as "coming soon". The form asks for an organization handle, an optional website URL, a logo (1:1 SVG or PNG with a background plate), where to list it, an **MCP server URL or a public GitHub repo**, a short description, and testing instructions. Submissions are reviewed. Third-party guides say a custom remote server must be reachable over public HTTPS with OAuth only; verify this on the form.

## Which route fits this project
* **Public GitHub repo route (works today):** the server is a local stdio server in `mcp/` of the public repo. No hosting needed.
* **Remote HTTPS route (not built):** needs a hosted Streamable-HTTP endpoint. GitHub Pages cannot host it. A small Node host or a serverless runtime would be needed; the engine has no native dependencies, but a serverless build has not been tried.

## Suggested form answers
* **Name:** Orbital Dominion
* **Handle:** your GitHub handle (`veo555`)
* **Website:** https://veo555.github.io/Orbital-Dominion/
* **Logo:** `docs/brand/logo-512.png` (or `docs/brand/logo.svg`)
* **Repository:** https://github.com/veo555/Orbital-Dominion (server in `mcp/`)
* **Description:** Play or watch a StarCraft-style RTS through MCP: start a match, issue orders, advance time, read a fog-honest view, compare an AI client with league-tuned agents. Deterministic replay logs; open source (MIT); runs locally, no network.
* **Testing instructions:**
  1. `git clone https://github.com/veo555/Orbital-Dominion && cd Orbital-Dominion/mcp && npm install`
  2. Add `node /abs/path/mcp/server.js` as a stdio MCP server in your client.
  3. Call `od_new_match` (mode `play`, tier `easy`, seed `7`), then `od_state`, `od_command` (train a hauler at the Hub), `od_advance` 30 s, `od_state` again.
  4. Optional: `node test/server_test.js` runs an automated check against the real server.

Do not submit until you have run the server in your own MCP client and are happy with how it plays.
