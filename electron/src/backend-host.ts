/**
 * Starts the embedded Fastify backend inside Electron's Node runtime.
 * Implementation: Step 5
 */
export async function startBackend(): Promise<{ port: number }> {
  // const app = await buildApp(); // from @pos/backend
  // await app.listen({ port: 0, host: '127.0.0.1' });
  return { port: 3001 };
}

export async function stopBackend(): Promise<void> {
  // graceful shutdown
}
