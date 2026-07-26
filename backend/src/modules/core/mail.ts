import nodemailer from 'nodemailer';

import { AppError } from './errors.js';

const DEFAULT_SUPPORT_INBOX = 'info@nexmindsystems.com';

export type SupportMailPayload = {
  to?: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
};

function requireSmtpConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim() || '587';
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || (user ? `Raunaq POS <${user}>` : '');

  if (!host || !user || !pass || !from) {
    throw new AppError(
      503,
      'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
      'SMTP_NOT_CONFIGURED',
    );
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new AppError(503, 'Invalid SMTP_PORT.', 'SMTP_NOT_CONFIGURED');
  }

  return { host, port, user, pass, from };
}

export function getSupportInboxEmail(): string {
  return process.env.SUPPORT_INBOX_EMAIL?.trim() || DEFAULT_SUPPORT_INBOX;
}

export async function sendSupportQueryEmail(payload: SupportMailPayload): Promise<void> {
  const smtp = requireSmtpConfig();
  const to = payload.to?.trim() || getSupportInboxEmail();

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: smtp.from,
      to,
      replyTo: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown mail error';
    throw new AppError(
      502,
      `Could not deliver your message by email. Please try again or use WhatsApp. (${detail})`,
      'EMAIL_DELIVERY_FAILED',
    );
  }
}
