import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { DesktopSession } from './session';

/**
 * n-gym MCP server for desktop clients such as Claude Desktop.
 *
 *   npx tsx mcp/server.mts --backup ~/Drive/n-gym/n-gym-backup.json [--changes ~/Drive/n-gym/n-gym-changes.json]
 */
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const backupArg = argument('backup');
if (!backupArg) {
  console.error('Usage: tsx mcp/server.mts --backup <backup.json> [--changes <changes.json>]');
  process.exit(1);
}
const backup = resolve(backupArg);
const changes = resolve(argument('changes') ?? join(dirname(backup), 'n-gym-changes.json'));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const session = new DesktopSession(backup, changes, join(root, 'drizzle'));

const server = new Server({ name: 'n-gym', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: session.tools() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await session.callTool(request.params.name, request.params.arguments ?? {});
  return { content: [{ type: 'text', text: result.text }], isError: result.isError };
});

await server.connect(new StdioServerTransport());
console.error(`n-gym MCP server: reading ${backup}, queueing changes in ${changes}`);
