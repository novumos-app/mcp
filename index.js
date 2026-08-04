#!/usr/bin/env node
/**
 * novumos-mcp — stdio MCP bridge for NovumOS (https://novumos.app).
 *
 * - Serves the public NovumOS tool catalog (initialize + tools/list) with no
 *   auth required, fetched from https://novumos.app/v1/mcp/manifest.
 * - Forwards tools/call to the hosted streamable-HTTP MCP server when the
 *   NOVUMOS_TOKEN environment variable is set.
 *
 * Mint a token in NovumOS: Settings -> Integrations -> Connect an agent.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const VERSION = "0.1.0";
const MANIFEST_URL =
  process.env.NOVUMOS_MANIFEST_URL || "https://novumos.app/v1/mcp/manifest";
const UPSTREAM_URL =
  process.env.NOVUMOS_MCP_URL || "https://novumos.app/v1/mcp/http";

const log = (...args) => console.error("[novumos-mcp]", ...args);

// ---------------------------------------------------------------------------
// Manifest: public, unauthenticated tool catalog.
// ---------------------------------------------------------------------------

/** @type {{tools: any[], instructions?: string} | null} */
let catalog = null;

async function fetchManifest() {
  const res = await fetch(MANIFEST_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${MANIFEST_URL}`);
  }
  const manifest = await res.json();
  // Manifest tools use snake_case `input_schema`; MCP expects `inputSchema`.
  const tools = (manifest.tools || []).map((t) => ({
    name: t.name,
    description: t.description || "",
    inputSchema: t.input_schema ||
      t.inputSchema || { type: "object", properties: {} },
  }));
  return { tools, instructions: manifest.server?.instructions };
}

async function loadCatalog() {
  if (catalog) return catalog;
  try {
    catalog = await fetchManifest();
    log(`Loaded ${catalog.tools.length} tools from ${MANIFEST_URL}`);
  } catch (err) {
    log(
      `WARNING: could not fetch NovumOS manifest (${err.message}). ` +
        "Starting with an empty tool list; will retry on the next tools/list."
    );
  }
  return catalog;
}

// ---------------------------------------------------------------------------
// Upstream: hosted NovumOS MCP server (streamable HTTP, Bearer auth).
// ---------------------------------------------------------------------------

/** @type {Client | null} */
let upstream = null;

async function getUpstream(token) {
  if (upstream) return upstream;
  const client = new Client(
    { name: "novumos-mcp-bridge", version: VERSION },
    { capabilities: {} }
  );
  const transport = new StreamableHTTPClientTransport(new URL(UPSTREAM_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  upstream = client;
  return upstream;
}

const NO_TOKEN_MESSAGE =
  "NOVUMOS_TOKEN is not set, so this bridge cannot call NovumOS on your behalf. " +
  "Mint an agent token in NovumOS (Settings -> Integrations -> Connect an agent) " +
  "and set it in this server's environment as NOVUMOS_TOKEN, then retry. " +
  "Tool discovery (tools/list) works without a token; tool calls require one.";

// ---------------------------------------------------------------------------
// Stdio MCP server.
// ---------------------------------------------------------------------------

async function main() {
  await loadCatalog();

  const server = new Server(
    { name: "novumos", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        catalog?.instructions ||
        "NovumOS — block-based kanban API for agents. Set NOVUMOS_TOKEN to call tools.",
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const c = await loadCatalog();
    return { tools: c?.tools || [] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const token = process.env.NOVUMOS_TOKEN;
    if (!token) {
      return {
        content: [{ type: "text", text: NO_TOKEN_MESSAGE }],
        isError: true,
      };
    }
    try {
      const client = await getUpstream(token);
      return await client.callTool({
        name: request.params.name,
        arguments: request.params.arguments || {},
      });
    } catch (err) {
      // Drop the cached connection so the next call reconnects cleanly.
      try {
        await upstream?.close();
      } catch {
        /* ignore */
      }
      upstream = null;
      return {
        content: [
          {
            type: "text",
            text:
              `NovumOS upstream call failed: ${err.message}. ` +
              "Check that NOVUMOS_TOKEN is a valid agent token " +
              "(mint one in NovumOS: Settings -> Integrations -> Connect an agent) " +
              "and that https://novumos.app is reachable, then retry.",
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(
    `NovumOS stdio bridge ready (${catalog?.tools.length ?? 0} tools; ` +
      `token ${process.env.NOVUMOS_TOKEN ? "set" : "not set — tool calls disabled"}).`
  );
}

main().catch((err) => {
  log("Fatal:", err);
  process.exit(1);
});
