import { buildReceiptHtml } from '@/components/billing/ReceiptView';
import { BRAND } from '@pos/shared';
import { formatMoney } from '@/lib/format';
import { printDocumentFooterHtml, printDocumentStyles } from '@/lib/print-document';
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
        <td>${s.saleNumber}${s.hasReturns ? ' <span style="font-size:10px;color:#666">(Adjusted)</span>' : ''}</td>
        <td>${new Date(s.createdAt).toLocaleString('en-PK')}</td>
        <td>${s.customer?.name ?? 'Walk-in'}</td>
        <td>${s.paymentStatus}</td>
        <td class="num">${formatMoney(s.hasReturns && s.netTotal ? s.netTotal : s.grandTotal, currency)}</td>
      </tr>`,
    )
    .join('');

  const total = sales.reduce(
    (sum, s) => sum + parseFloat(s.hasReturns && s.netTotal ? s.netTotal : s.grandTotal),
    0,
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sales Report</title>
  <style>
    ${printDocumentStyles()}
    @page { size: A4; margin: 14mm; }
    .brand-logo { display: block; width: 140px; height: auto; margin: 0 0 12px; }
  </style>
</head>
<body>
  <img class="brand-logo" src="${window.location.origin}/raunaq-logo-light.png" alt="${BRAND.productName}" />
  <div class="doc-header">
    <div>
      <div class="doc-title">${businessName}</div>
      <div class="doc-sub">Sales report · ${period}</div>
    </div>
    <div class="meta">
      <div><strong>${sales.length}</strong> transaction(s)</div>
      <div>Generated ${new Date().toLocaleString('en-PK')}</div>
    </div>
  </div>
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
    <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#888;padding:24px">No sales</td></tr>`}</tbody>
  </table>
  <div class="summary">
    <div class="summary-box">
      <div class="summary-row total"><span>Grand total</span><span>${formatMoney(total, currency)}</span></div>
    </div>
  </div>
  ${printDocumentFooterHtml()}
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
