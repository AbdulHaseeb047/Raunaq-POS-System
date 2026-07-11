import { buildReceiptHtml } from '@/components/billing/ReceiptView';
import { api } from '@/lib/api-client';
import type { BusinessSettings, SaleDetail } from '@/types/api';

export type PrintResult = { mode: 'NETWORK' | 'BROWSER' };

function printReceiptBrowser(sale: SaleDetail, currency: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(buildReceiptHtml(sale, currency));
  doc.close();

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  window.setTimeout(() => document.body.removeChild(iframe), 1500);
}

export async function printSaleReceipt(
  sale: SaleDetail,
  settings: BusinessSettings | undefined,
  currency: string,
): Promise<PrintResult> {
  if (settings?.printerMode === 'NETWORK' && settings.printerHost) {
    await api.sales.printSlip(sale.id);
    return { mode: 'NETWORK' };
  }

  printReceiptBrowser(sale, currency);
  return { mode: 'BROWSER' };
}

export { printReceiptBrowser };
