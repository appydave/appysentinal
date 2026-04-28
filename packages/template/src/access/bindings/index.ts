// Bindings layer — thin protocol adapters.
//
// A binding translates between a protocol (MCP, HTTP, CLI) and the
// query/ and command/ layers. Bindings contain NO business logic.
// They validate input, call a query or command function, and format
// the response for the protocol. That is all.
//
// RULE: if you are writing data transformation, filtering, sorting, or
// joining inside a binding, move it to query/. Bindings are adapters,
// not processors.
//
// MCP binding pattern (stdio):
//
//   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
//   import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
//   import { getLatestSnapshot } from '../query/index.js';
//   import { triggerCollection } from '../command/index.js';
//
//   const server = new McpServer({ name: 'my-sentinel', version: '1.0.0' });
//
//   server.tool('get_snapshot', {}, async () => {
//     const result = await getLatestSnapshot(opts.dataDir);
//     return { content: [{ type: 'text', text: JSON.stringify(result) }] };
//   });
//
//   server.tool('trigger_collect', {}, async () => {
//     await triggerCollection(opts.stateDir);
//     return { content: [{ type: 'text', text: 'Collection queued.' }] };
//   });
//
//   await server.connect(new StdioServerTransport());
//
// API binding pattern (Hono):
//
//   import { Hono } from 'hono';
//   const app = new Hono();
//   app.get('/snapshot', async (c) => c.json(await getLatestSnapshot(opts.dataDir)));
//   Bun.serve({ port: opts.port, fetch: app.fetch });
