/**
 * Electron main process entry point.
 * Step 5: wire PostgreSQL lifecycle + embedded Fastify backend.
 *
 * Lifecycle (see ARCHITECTURE.md §11):
 * 1. Start local PostgreSQL
 * 2. Run migrations if first launch
 * 3. Start Fastify backend in-process
 * 4. Open BrowserWindow → local frontend
 * 5. On quit: graceful shutdown
 */

console.log('POS Electron — scaffold only. Full wrapper in Step 5.');

// import { app, BrowserWindow } from 'electron';
// import { startBackend } from './backend-host.js';
// import { postgresManager } from './postgres/manager.js';
