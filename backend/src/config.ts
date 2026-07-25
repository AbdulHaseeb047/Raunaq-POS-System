export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  deploymentMode: 'cloud' | 'offline' | 'hybrid';
  tenantId: string | null;
  databaseUrl: string;
  corsOrigins: string[] | true;
  trustProxy: boolean;
  /** WhatsApp upgrade CTA for soft-locked shops (wa.me link). */
  upgradeWhatsappUrl: string;
  jwt: {
    secret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseCorsOrigins(nodeEnv: string): string[] | true {
  if (nodeEnv !== 'production') return true;
  const raw = process.env.CORS_ORIGINS;
  if (!raw?.trim()) {
    throw new Error('CORS_ORIGINS is required in production (comma-separated allowed origins)');
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function assertProductionSecrets(
  nodeEnv: string,
  jwtSecret: string,
  jwtRefreshSecret: string,
): void {
  if (nodeEnv !== 'production') return;
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  if (jwtRefreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters in production');
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = requireEnv('JWT_SECRET');
const jwtRefreshSecret = requireEnv('JWT_REFRESH_SECRET');
assertProductionSecrets(nodeEnv, jwtSecret, jwtRefreshSecret);

const defaultUpgradeWhatsapp =
  'https://wa.me/923462734539?text=' +
  encodeURIComponent("Hi, I'd like to upgrade my Raunaq POS plan");

export const appConfig: AppConfig = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv,
  deploymentMode: (process.env.DEPLOYMENT_MODE as AppConfig['deploymentMode']) ?? 'offline',
  tenantId: process.env.TENANT_ID || null,
  databaseUrl: requireEnv('DATABASE_URL'),
  corsOrigins: parseCorsOrigins(nodeEnv),
  trustProxy: process.env.TRUST_PROXY === 'true',
  upgradeWhatsappUrl: process.env.UPGRADE_WHATSAPP_URL?.trim() || defaultUpgradeWhatsapp,
  jwt: {
    secret: jwtSecret,
    refreshSecret: jwtRefreshSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
};
