#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

async function main() {
  const transport = new StdioServerTransport();

  const server = createMcpServer();
  await server.connect(transport);

  console.error("ios-sim-mcp server running on stdio");
}

main().catch(err => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
