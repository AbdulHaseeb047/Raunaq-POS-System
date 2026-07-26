import { z } from 'zod';

import { AppError } from '../core/errors.js';
import { getSupportInboxEmail, sendSupportQueryEmail } from '../core/mail.js';
import { prisma } from '../core/prisma.js';

export const createSupportQuerySchema = z.object({
  topic: z.enum(['billing', 'technical', 'feature', 'account', 'other']),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10).max(4000),
  /** Email where support should reply — may differ from login email. */
  contactEmail: z.string().trim().email().max(255),
});

export type CreateSupportQueryInput = z.infer<typeof createSupportQuerySchema>;

const TOPIC_LABELS: Record<CreateSupportQueryInput['topic'], string> = {
  billing: 'Billing & plans',
  technical: 'Technical issue',
  feature: 'Feature request',
  account: 'Account & staff',
  other: 'Something else',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function createSupportQuery(
  tenantId: string,
  userId: string,
  input: CreateSupportQueryInput,
) {
  const [user, tenant, settings] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, fullName: true },
    }),
    prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    }),
    prisma.businessSettings.findUnique({
      where: { tenantId },
      select: { businessName: true },
    }),
  ]);

  if (!user) {
    throw new AppError(401, 'User not found', 'UNAUTHORIZED');
  }

  const row = await prisma.supportQuery.create({
    data: {
      tenantId,
      userId,
      topic: input.topic,
      subject: input.subject,
      message: input.message,
    },
    select: {
      id: true,
      topic: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  });

  const shopName = settings?.businessName?.trim() || tenant?.name || 'Unknown shop';
  const topicLabel = TOPIC_LABELS[input.topic];
  const createdAt = row.createdAt.toISOString();
  const contactEmail = input.contactEmail.trim().toLowerCase();

  const text = [
    'New Raunaq POS help request',
    '',
    `Query ID: ${row.id}`,
    `Created: ${createdAt}`,
    `Topic: ${topicLabel} (${input.topic})`,
    `Subject: ${input.subject}`,
    '',
    `Shop: ${shopName}`,
    tenant?.slug ? `Tenant slug: ${tenant.slug}` : null,
    `Tenant ID: ${tenantId}`,
    `From: ${user.fullName}`,
    `Contact email (reply here): ${contactEmail}`,
    `Account email: ${user.email}`,
    `User ID: ${user.id}`,
    '',
    'Message:',
    input.message,
    '',
    '— Reply to this email to contact the customer directly.',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #0f2926;">
      <h2 style="margin: 0 0 12px;">New Raunaq POS help request</h2>
      <p style="margin: 0 0 8px;"><strong>Query ID:</strong> ${escapeHtml(row.id)}</p>
      <p style="margin: 0 0 8px;"><strong>Created:</strong> ${escapeHtml(createdAt)}</p>
      <p style="margin: 0 0 8px;"><strong>Topic:</strong> ${escapeHtml(topicLabel)} (${escapeHtml(input.topic)})</p>
      <p style="margin: 0 0 16px;"><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
      <hr style="border: none; border-top: 1px solid #d1e7e2; margin: 16px 0;" />
      <p style="margin: 0 0 8px;"><strong>Shop:</strong> ${escapeHtml(shopName)}</p>
      ${tenant?.slug ? `<p style="margin: 0 0 8px;"><strong>Tenant slug:</strong> ${escapeHtml(tenant.slug)}</p>` : ''}
      <p style="margin: 0 0 8px;"><strong>Tenant ID:</strong> ${escapeHtml(tenantId)}</p>
      <p style="margin: 0 0 8px;"><strong>From:</strong> ${escapeHtml(user.fullName)}</p>
      <p style="margin: 0 0 8px;"><strong>Contact email (reply here):</strong> ${escapeHtml(contactEmail)}</p>
      <p style="margin: 0 0 8px;"><strong>Account email:</strong> ${escapeHtml(user.email)}</p>
      <p style="margin: 0 0 16px;"><strong>User ID:</strong> ${escapeHtml(user.id)}</p>
      <hr style="border: none; border-top: 1px solid #d1e7e2; margin: 16px 0;" />
      <p style="margin: 0 0 8px;"><strong>Message</strong></p>
      <pre style="white-space: pre-wrap; font-family: inherit; background: #f4faf8; padding: 12px; border-radius: 8px;">${escapeHtml(input.message)}</pre>
      <p style="margin: 16px 0 0; font-size: 12px; color: #5f7a75;">Reply to this email to contact the customer directly.</p>
    </div>
  `.trim();

  await sendSupportQueryEmail({
    to: getSupportInboxEmail(),
    replyTo: contactEmail,
    subject: `[Raunaq Help] ${input.topic} — ${input.subject}`,
    text,
    html,
  });

  return row;
}
