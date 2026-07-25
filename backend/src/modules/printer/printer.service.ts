import net from 'node:net';

import { ValidationError } from '../core/errors.js';
import { getSaleDetail } from '../billing/billing.service.js';
import { getSettings } from '../settings/settings.service.js';
import {
  buildEscPosReceipt,
  buildEscPosTestReceipt,
  type EscPosReceiptInput,
  type PrinterPaperWidth,
} from './escpos.js';

function normalizePaperWidth(value: number): PrinterPaperWidth {
  return value <= 58 ? 58 : 80;
}

export async function sendToNetworkPrinter(
  host: string,
  port: number,
  data: Buffer,
): Promise<void> {
  if (!host.trim()) throw new ValidationError('Printer IP address is required');

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: host.trim(), port }, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
      });
    });

    socket.setTimeout(10_000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new ValidationError('Printer connection timed out. Check IP, cable, and power.'));
    });
    socket.on('error', (err) => {
      reject(new ValidationError(`Could not reach printer at ${host}:${port}. ${err.message}`));
    });
    socket.on('close', () => resolve());
  });
}

export async function printSaleSlip(
  tenantId: string,
  saleId: string,
): Promise<{ success: true; mode: 'NETWORK' }> {
  const [sale, settings] = await Promise.all([
    getSaleDetail(tenantId, saleId),
    getSettings(tenantId),
  ]);

  if (settings.printerMode !== 'NETWORK') {
    throw new ValidationError('Network slip printer is not enabled in Settings.');
  }
  if (!settings.printerHost) {
    throw new ValidationError('Printer IP address is not configured in Settings.');
  }

  const payload: EscPosReceiptInput = {
    saleNumber: sale.saleNumber,
    createdAt: sale.createdAt,
    customerName: sale.customer?.name ?? null,
    cashierName: sale.cashier.fullName,
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    taxTotal: sale.taxTotal,
    grandTotal: sale.grandTotal,
    notes: sale.notes,
    fbrInvoiceNumber: sale.fbrInvoiceNumber,
    amountReceived: sale.amountReceived,
    changeGiven: sale.changeGiven,
    items: sale.items,
    payments: sale.payments,
    returns: sale.returns.map((r) => ({
      returnNumber: r.returnNumber,
      reason: r.reason,
      totalAmount: r.totalAmount,
      items: r.items.map((ri) => ({
        productName: ri.productName,
        quantity: ri.quantity,
        refundAmount: ri.refundAmount,
      })),
    })),
    receipt: {
      businessName: sale.receipt.businessName,
      address: sale.receipt.address ?? null,
      phone: sale.receipt.phone ?? null,
      taxLabel: sale.receipt.taxLabel,
      receiptFooter: sale.receipt.receiptFooter ?? null,
      currency: sale.receipt.currency,
      fbrEnabled: sale.receipt.fbrEnabled,
      fbrPosId: sale.receipt.fbrPosId,
      fbrStrn: sale.receipt.fbrStrn,
      fbrRegisteredName: sale.receipt.fbrRegisteredName,
      builtBy: sale.receipt.builtBy,
    },
  };

  const paper = normalizePaperWidth(settings.printerPaperWidth);
  const data = buildEscPosReceipt(payload, paper);
  await sendToNetworkPrinter(settings.printerHost, settings.printerPort, data);
  return { success: true, mode: 'NETWORK' };
}

export async function testNetworkPrinter(tenantId: string): Promise<{ success: true }> {
  const settings = await getSettings(tenantId);
  if (!settings.printerHost) {
    throw new ValidationError('Enter the printer IP address and save settings first.');
  }

  const paper = normalizePaperWidth(settings.printerPaperWidth);
  const data = buildEscPosTestReceipt(settings.businessName, paper);
  await sendToNetworkPrinter(settings.printerHost, settings.printerPort, data);
  return { success: true };
}
