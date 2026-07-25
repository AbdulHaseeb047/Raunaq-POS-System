import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContext = {
  tenantId: string | null;
  /** When true, Prisma extension / RLS bypass applies (platform admin). */
  bypass: boolean;
};

const storage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** Bind tenant context for the rest of the current async request. */
export function enterTenantContext(ctx: TenantContext): void {
  storage.enterWith(ctx);
}

export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
