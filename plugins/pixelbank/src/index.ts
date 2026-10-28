import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

let runtime: ReturnType<typeof createServer> | undefined;
const handle = serveStdio(() => { runtime = createServer(); return runtime.server; });
const stop = async () => { await runtime?.stop(); await handle.close(); };
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
