import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../.env');

let envUser = '(unknown)';
let envHost = '(unknown)';
let envPort = '(unknown)';
let envDb = '(unknown)';

try {
  const raw = readFileSync(envPath, 'utf8');
  const match = raw.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    const line = match[1]!.trim().replace(/^["']|["']$/g, '');
    const url = new URL(line);
    envUser = url.username;
    envHost = url.hostname;
    envPort = url.port || '5432';
    envDb = url.pathname.replace(/^\//, '').split('?')[0] ?? '';
  }
} catch {
  // ignore parse errors
}

console.log('Env file:', envPath);
console.log('Parsed from .env file:');
console.log('  user:', envUser);
console.log('  host:', envHost);
console.log('  port:', envPort);
console.log('  database:', envDb);
console.log(
  '  password length:',
  process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).password.length : 0,
);

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log('Connection: SUCCESS');
} catch (err) {
  console.log('Connection: FAILED');
  console.log(String(err));
} finally {
  await prisma.$disconnect();
}
