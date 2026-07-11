/**
 * Local PostgreSQL lifecycle manager.
 * Implementation: Step 5
 *
 * Responsibilities:
 * - initdb on first run
 * - start/stop pg on configured port
 * - data directory: %APPDATA%/POS/data/pg
 */
export const postgresManager = {
  async start(): Promise<{ port: number }> {
    return { port: 5432 };
  },
  async stop(): Promise<void> {
    // pg_ctl stop
  },
  async isInitialized(): Promise<boolean> {
    return false;
  },
};
