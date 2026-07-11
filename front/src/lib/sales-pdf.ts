import { buildReceiptHtml } from '@/components/billing/ReceiptView';
import { BRAND } from '@pos/shared';
import { formatMoney } from '@/lib/format';
import type { SaleDetail, SaleListItem } from '@/types/api';

/** Opens a print dialog — user chooses "Save as PDF" for a proper PDF file. */
export function downloadHtmlAsPdf(html: string, title: string): void {
  const win = window.open('', '_blank');
  if (!win) return;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;

  win.onload = () => {
    win.focus();
    win.print();
  };
}

export function downloadSaleInvoicePdf(sale: SaleDetail, currency: string): void {
  const receiptHtml = buildReceiptHtml(sale, currency);
  const invoiceHtml = receiptHtml.replace(
    '<style>',
    `<style>
    @page { size: A4; margin: 12mm; }
    body { width: auto; max-width: 180mm; font-size: 12px; }
    @media print { body { margin: 0 auto; } }`,
  );
  downloadHtmlAsPdf(invoiceHtml, `Invoice-${sale.saleNumber}`);
}

export function buildSalesReportHtml(
  sales: SaleListItem[],
  currency: string,
  businessName: string,
  from?: string,
  to?: string,
): string {
  const period =
    from && to
      ? `${from} to ${to}`
      : new Date().toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

  const rows = sales
    .map(
      (s) => `
      <tr>
        <td>${s.saleNumber}</td>
        <td>${new Date(s.createdAt).toLocaleString('en-PK')}</td>
        <td>${s.customer?.name ?? 'Walk-in'}</td>
        <td>${s.paymentStatus}</td>
        <td class="num">${formatMoney(s.grandTotal, currency)}</td>
      </tr>`,
    )
    .join('');

  const total = sales.reduce((sum, s) => sum + parseFloat(s.grandTotal), 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sales Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 14mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; padding: 24px; }
    .brand-logo { display: block; width: 150px; height: auto; margin: 0 0 12px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
    td.num, th.num { text-align: right; }
    tfoot td { font-weight: 700; background: #fafafa; }
    .footer { margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <img class="brand-logo" src="${window.location.origin}/raunaq-logo-light.png" alt="${BRAND.productName}" />
  <h1>${businessName}</h1>
  <p class="meta">Sales Report · ${period} · ${sales.length} transaction(s)</p>
  <table>
    <thead>
      <tr>
        <th>Bill #</th>
        <th>Date &amp; Time</th>
        <th>Customer</th>
        <th>Payment</th>
        <th class="num">Total (${currency})</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">Grand total</td>
        <td class="num">${formatMoney(total, currency)}</td>
      </tr>
    </tfoot>
  </table>
  <p class="footer">Generated ${new Date().toLocaleString('en-PK')} · ${BRAND.productName}</p>
</body>
</html>`;
}

export function downloadSalesReportPdf(
  sales: SaleListItem[],
  currency: string,
  businessName: string,
  from?: string,
  to?: string,
): void {
  const html = buildSalesReportHtml(sales, currency, businessName, from, to);
  downloadHtmlAsPdf(html, `Sales-Report-${new Date().toISOString().slice(0, 10)}`);
}
