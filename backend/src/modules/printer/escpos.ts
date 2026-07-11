export type PrinterPaperWidth = 58 | 80;

export interface EscPosSaleItem {
  productName: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
}

export interface EscPosSalePayment {
  paymentMethod: string;
  amount: string;
}

export interface EscPosReceiptInput {
  saleNumber: string;
  createdAt: string;
  customerName: string | null;
  cashierName: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  notes: string | null;
  fbrInvoiceNumber: string | null;
  amountReceived: string | null;
  changeGiven: string | null;
  items: EscPosSaleItem[];
  payments: EscPosSalePayment[];
  receipt: {
    businessName: string;
    address: string | null;
    phone: string | null;
    taxLabel: string;
    receiptFooter: string | null;
    currency: string;
    fbrEnabled: boolean;
    fbrPosId: string | null;
    fbrStrn: string | null;
    fbrRegisteredName: string | null;
    builtBy?: string | null;
  };
}

import { BRAND } from '@pos/shared';

function paymentLabel(method: string): string {
  const map: Record<string, string> = {
    CASH: 'Cash',
    CARD: 'Card',
    CREDIT: 'Udhaar',
    BANK_TRANSFER: 'Bank',
    SPLIT: 'Split',
  };
  return map[method] ?? method;
}

function formatMoney(amount: string | number, currency: string): string {
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  return `${currency} ${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function lineWidth(paper: PrinterPaperWidth): number {
  return paper === 58 ? 32 : 48;
}

function padLine(left: string, right: string, width: number): string {
  const r = right.trim();
  const maxLeft = Math.max(1, width - r.length - 1);
  const l = left.length > maxLeft ? `${left.slice(0, maxLeft - 1)}.` : left;
  const spaces = Math.max(1, width - l.length - r.length);
  return `${l}${' '.repeat(spaces)}${r}`;
}

function divider(width: number, char = '-'): string {
  return char.repeat(width);
}

function esc(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

function textLine(text: string): Buffer {
  return Buffer.from(`${text}\n`, 'utf8');
}

export function buildEscPosReceipt(input: EscPosReceiptInput, paperWidth: PrinterPaperWidth = 80): Buffer {
  const width = lineWidth(paperWidth);
  const r = input.receipt;
  const currency = r.currency || 'PKR';
  const chunks: Buffer[] = [];

  chunks.push(esc(0x1b, 0x40)); // init
  chunks.push(esc(0x1b, 0x61, 1)); // center
  chunks.push(esc(0x1b, 0x45, 1)); // bold on
  chunks.push(textLine(r.businessName.toUpperCase()));
  chunks.push(esc(0x1b, 0x45, 0)); // bold off
  if (r.address) chunks.push(textLine(r.address));
  if (r.phone) chunks.push(textLine(`Tel: ${r.phone}`));
  chunks.push(textLine(divider(width, '=')));

  chunks.push(esc(0x1b, 0x61, 0)); // left
  chunks.push(textLine('INVOICE DETAILS'));
  chunks.push(textLine(divider(width)));
  chunks.push(textLine(padLine('Invoice #', input.saleNumber, width)));
  chunks.push(textLine(padLine('Date', formatDate(input.createdAt), width)));
  chunks.push(textLine(padLine('Customer', input.customerName ?? 'Walk-in', width)));
  chunks.push(textLine(padLine('Cashier', input.cashierName, width)));

  if (r.fbrEnabled && input.fbrInvoiceNumber) {
    chunks.push(textLine(''));
    chunks.push(esc(0x1b, 0x61, 1));
    chunks.push(esc(0x1b, 0x45, 1));
    chunks.push(textLine('FBR INTEGRATED INVOICE'));
    chunks.push(esc(0x1b, 0x45, 0));
    if (r.fbrRegisteredName) chunks.push(textLine(r.fbrRegisteredName));
    if (r.fbrStrn) chunks.push(textLine(`STRN/NTN: ${r.fbrStrn}`));
    if (r.fbrPosId) chunks.push(textLine(`POS ID: ${r.fbrPosId}`));
    chunks.push(textLine(`FBR #: ${input.fbrInvoiceNumber}`));
    chunks.push(esc(0x1b, 0x61, 0));
  }

  chunks.push(textLine(''));
  chunks.push(textLine(`ITEMS (${input.items.length})`));
  chunks.push(textLine(divider(width)));
  for (const item of input.items) {
    const qty = parseFloat(item.quantity);
    const name = item.productName;
    chunks.push(textLine(name.length > width ? name.slice(0, width) : name));
    const detail = `${qty} x ${formatMoney(item.unitPrice, currency)}`;
    chunks.push(textLine(padLine(detail, formatMoney(item.lineTotal, currency), width)));
    if (parseFloat(item.discountAmount) > 0) {
      chunks.push(textLine(`  Disc: -${formatMoney(item.discountAmount, currency)}`));
    }
  }

  chunks.push(textLine(divider(width)));
  chunks.push(textLine('PAYMENT SUMMARY'));
  chunks.push(textLine(padLine('Subtotal', formatMoney(input.subtotal, currency), width)));
  if (parseFloat(input.discountTotal) > 0) {
    chunks.push(textLine(padLine('Discount', `-${formatMoney(input.discountTotal, currency)}`, width)));
  }
  if (parseFloat(input.taxTotal) > 0) {
    chunks.push(textLine(padLine(r.taxLabel, formatMoney(input.taxTotal, currency), width)));
  }
  chunks.push(esc(0x1b, 0x45, 1));
  chunks.push(textLine(padLine('GRAND TOTAL', formatMoney(input.grandTotal, currency), width)));
  chunks.push(esc(0x1b, 0x45, 0));

  if (input.payments.length > 0) {
    chunks.push(textLine(''));
    chunks.push(textLine('PAYMENT RECEIVED'));
    for (const p of input.payments) {
      chunks.push(textLine(padLine(paymentLabel(p.paymentMethod), formatMoney(p.amount, currency), width)));
    }
  }

  if (input.amountReceived != null) {
    chunks.push(textLine(padLine('Cash tendered', formatMoney(input.amountReceived, currency), width)));
  }
  if (input.changeGiven != null && parseFloat(input.changeGiven) > 0) {
    chunks.push(esc(0x1b, 0x45, 1));
    chunks.push(textLine(padLine('Change back', formatMoney(input.changeGiven, currency), width)));
    chunks.push(esc(0x1b, 0x45, 0));
  }

  if (input.notes) {
    chunks.push(textLine(''));
    chunks.push(textLine('NOTES'));
    chunks.push(textLine(input.notes));
  }

  chunks.push(textLine(''));
  chunks.push(esc(0x1b, 0x61, 1));
  if (r.receiptFooter) chunks.push(textLine(r.receiptFooter));
  chunks.push(esc(0x1b, 0x45, 1));
  chunks.push(textLine('Thank you!'));
  chunks.push(esc(0x1b, 0x45, 0));
  chunks.push(textLine(`${BRAND.productName}`));
  chunks.push(esc(0x1b, 0x61, 0));

  chunks.push(esc(0x1b, 0x64, 3)); // feed
  chunks.push(esc(0x1d, 0x56, 0)); // cut

  return Buffer.concat(chunks);
}

export function buildEscPosTestReceipt(businessName: string, paperWidth: PrinterPaperWidth = 80): Buffer {
  const width = lineWidth(paperWidth);
  const chunks: Buffer[] = [];
  chunks.push(esc(0x1b, 0x40));
  chunks.push(esc(0x1b, 0x61, 1));
  chunks.push(esc(0x1b, 0x45, 1));
  chunks.push(textLine('PRINTER TEST'));
  chunks.push(esc(0x1b, 0x45, 0));
  chunks.push(textLine(businessName));
  chunks.push(textLine(new Date().toLocaleString('en-PK')));
  chunks.push(textLine(divider(width)));
  chunks.push(textLine('If you can read this,'));
  chunks.push(textLine('your slip printer works.'));
  chunks.push(esc(0x1b, 0x64, 3));
  chunks.push(esc(0x1d, 0x56, 0));
  return Buffer.concat(chunks);
}
