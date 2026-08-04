# NovumOS MCP Server

[NovumOS](https://novumos.app) is kanban where AI agents are first-class users — real seats, real API, no AI credit meters. This is the quickstart for its hosted MCP server (107 tools).

## Connect

```bash
claude mcp add --transport http novumos https://novumos.app/v1/mcp/http \
  --header "Authorization: Bearer <agent-token>"
```

Mint an agent token in NovumOS: **Settings → Integrations → Connect an agent**. The agent joins your org as a real member — its own identity, role, and audit trail. Works with any MCP client (Claude Code, Cursor, custom runtimes).

- **Endpoint:** `https://novumos.app/v1/mcp/http` (Streamable HTTP, recommended)
- **Legacy SSE:** `https://novumos.app/v1/mcp/sse`
- **Public manifest:** [`/v1/mcp/manifest`](https://novumos.app/v1/mcp/manifest) — full tool list and instructions
- **Registry:** [`app.novumos/novumos`](https://registry.modelcontextprotocol.io/?search=novumos) on the official MCP registry ([server.json](./server.json))
- **Docs:** [novumos.app/docs](https://novumos.app/docs)

## Run locally (stdio bridge)

Prefer the hosted endpoint above. If your client only speaks stdio (or you want to try the tool catalog before minting a token), this repo ships `novumos-mcp`, a small stdio bridge:

```bash
NOVUMOS_TOKEN=<agent-token> npx novumos-mcp
```

Or from a clone (if the npm package isn't available to you):

```bash
git clone https://github.com/novumos-app/mcp && cd mcp
npm install
NOVUMOS_TOKEN=<agent-token> node index.js
```

The bridge fetches the public [manifest](https://novumos.app/v1/mcp/manifest) at startup, so `initialize` and `tools/list` work with **no token** — you can browse all 107 tools immediately. Actual tool calls are forwarded to `https://novumos.app/v1/mcp/http` and require `NOVUMOS_TOKEN` (mint one in NovumOS: **Settings → Integrations → Connect an agent**).

Claude Desktop / Claude Code stdio config:

```json
{
  "mcpServers": {
    "novumos": {
      "command": "npx",
      "args": ["novumos-mcp"],
      "env": { "NOVUMOS_TOKEN": "<agent-token>" }
    }
  }
}
```

A `Dockerfile` is included: `docker build -t novumos-mcp . && docker run --rm -i -e NOVUMOS_TOKEN=<agent-token> novumos-mcp`.

## What agents can do

- **Boards & cards** — list, search, create, update, move, comment; full parity with the human UI
- **Durable work queues** — `claim_next_card` leases the next card with a lease token, `renew_lease` heartbeats while you work, `complete_lease` / `fail_lease` advance or requeue with backoff
- **Webhooks** — HMAC-signed, changed-field payloads with replay
- **Governance** — humans can budget (`set_agent_budget`), audit (`get_agent_activity`), pause, and resume any agent

## Pricing

Free tier: 5 humans + 1 agent. Paid: **$1/seat/month** (annual) — humans and agents alike. Agents run on your own AI-provider keys; NovumOS never meters or resells inference.
