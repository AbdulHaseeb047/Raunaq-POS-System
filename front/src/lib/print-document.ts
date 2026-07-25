import { BRAND } from '@pos/shared';

import { formatDate, formatMoney } from '@/lib/format';

const DEVELOPER = {
  line: BRAND.developer?.line ?? 'System developed by NexMindSystems',
  website: BRAND.developer?.website ?? 'www.NexMindSystems.com',
  websiteUrl: BRAND.developer?.websiteUrl ?? 'https://www.NexMindSystems.com',
  phone: BRAND.developer?.phone ?? '03462734539',
};

/** Shared print stylesheet for statements / slips across the app. */
export function printDocumentStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 28px; max-width: 800px; margin: 0 auto; font-size: 13px; line-height: 1.45; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #1a1a1a; margin-bottom: 20px; }
    .doc-title { font-size: 20px; font-weight: 800; letter-spacing: 0.02em; }
    .doc-sub { font-size: 12px; color: #666; margin-top: 4px; }
    .meta { font-size: 12px; color: #444; text-align: right; }
    .meta strong { color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #888; border-bottom: 2px solid #1a1a1a; padding: 8px 10px; background: #f7f7f8; }
    thead th.num, td.num { text-align: right; }
    tbody td { padding: 10px; border-bottom: 1px solid #e8e8ea; font-size: 12px; }
    tbody tr:nth-child(even) { background: #fafafa; }
    .summary { margin-top: 20px; display: flex; justify-content: flex-end; }
    .summary-box { min-width: 220px; border: 1px solid #e5e5e5; border-radius: 10px; padding: 14px 16px; background: #fafafa; }
    .summary-row { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; font-size: 12px; }
    .summary-row.total { font-size: 15px; font-weight: 800; border-top: 2px solid #1a1a1a; margin-top: 8px; padding-top: 10px; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px dashed #ccc; text-align: center; font-size: 11px; color: #666; }
    .dev-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 10px; color: #888; }
    @media print { body { padding: 12px; } }
  `;
}

export function printDocumentFooterHtml(): string {
  return `
  <div class="footer">
    <div>${DEVELOPER.line}</div>
    <div class="dev-row">
      <a href="${DEVELOPER.websiteUrl}" style="color:#666;text-decoration:none">${DEVELOPER.website}</a>
      <span>${DEVELOPER.phone}</span>
    </div>
  </div>`;
}

export function openPrintDocument(title: string, bodyHtml: string): void {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${title}</title>
    <style>${printDocumentStyles()}</style></head><body>${bodyHtml}${printDocumentFooterHtml()}
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
  w.document.close();
}

export function buildCustomerStatementHtml(
  customer: { name: string; phone: string | null; balance: string },
  ledger: Array<{ entryType: string; amount: string; balanceAfter: string; createdAt: string; description?: string }>,
  currency: string,
  businessName: string,
): string {
  const rows = ledger
    .map(
      (e) =>
        `<tr>
          <td>${e.description ?? e.entryType}</td>
          <td class="num">${formatMoney(e.amount, currency)}</td>
          <td class="num">${formatMoney(e.balanceAfter, currency)}</td>
          <td>${formatDate(e.createdAt)}</td>
        </tr>`,
    )
    .join('');

  return `
    <div class="doc-header">
      <div>
        <div class="doc-title">${businessName}</div>
        <div class="doc-sub">Customer statement</div>
      </div>
      <div class="meta">
        <div><strong>${customer.name}</strong></div>
        <div>Phone: ${customer.phone ?? '—'}</div>
        <div>Printed ${new Date().toLocaleString('en-PK')}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Amount</th>
          <th class="num">Balance</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#888;padding:24px">No ledger entries</td></tr>`}</tbody>
    </table>
    <div class="summary">
      <div class="summary-box">
        <div class="summary-row total"><span>Outstanding</span><span>${formatMoney(customer.balance, currency)}</span></div>
      </div>
    </div>`;
}
