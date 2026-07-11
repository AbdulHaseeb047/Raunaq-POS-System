import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { BRAND } from '@pos/shared';

import { writeAuditLog } from '../audit/audit.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import { calculateSaleTotals } from './billing.totals.js';
import { nextSaleNumber } from './sale-sequence.js';
import { recordCreditSale } from '../customers/ledger.service.js';
import { recordDiscountUsages } from './discounts.service.js';
import { getSettings } from '../settings/settings.service.js';
import { lockCustomerForUpdate } from '../customers/customer-lock.js';
import { decrementProductStock, incrementProductStock } from '../inventory/product-stock.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
});

export const createSaleSchema = z.object({
  customerId: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'SPLIT']),
  cashAmount: z.number().nonnegative().optional(),
  creditAmount: z.number().nonnegative().optional(),
  items: z.array(saleItemSchema).min(1),
  billDiscountAmount: z.number().nonnegative().optional(),
  appliedDiscounts: z
    .array(z.object({ ruleId: z.string().uuid(), amount: z.number().nonnegative() }))
    .optional(),
  notes: z.string().optional(),
  printReceipt: z.boolean().optional(),
  amountReceived: z.number().nonnegative().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export async function createSale(
  tenantId: string,
  cashierId: string,
  input: CreateSaleInput,
  options?: { canDiscountUnlimited?: boolean; maxDiscountPercent?: number | null; branchId?: string },
) {
  if (input.paymentMethod === 'CREDIT' && !input.customerId) {
    throw new ValidationError('Customer is required for credit sales');
  }
  if (input.paymentMethod === 'SPLIT') {
    if (!input.customerId) throw new ValidationError('Customer is required for split payment');
    const cash = input.cashAmount ?? 0;
    const credit = input.creditAmount ?? 0;
    if (cash <= 0 && credit <= 0) throw new ValidationError('Split payment requires cash or credit amount');
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds }, deletedAt: null, isActive: true },
  });

  if (products.length !== productIds.length) {
    throw new NotFoundError('One or more products not found');
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  const totals = calculateSaleTotals(
    input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        unitPrice: item.unitPrice ?? product.sellPrice,
        quantity: item.quantity,
        discountAmount: item.discountAmount ?? 0,
        taxRatePercent: product.taxRate,
      };
    }),
    input.billDiscountAmount ?? 0,
  );

  if (!options?.canDiscountUnlimited && options?.maxDiscountPercent != null && totals.discountTotal.gt(0)) {
    const maxAllowed = totals.subtotal.times(options.maxDiscountPercent).div(100);
    if (totals.discountTotal.gt(maxAllowed)) {
      throw new ForbiddenError(`Discount exceeds allowed maximum of ${options.maxDiscountPercent}%`);
    }
  }

  const { subtotal, discountTotal, taxTotal, grandTotal } = totals;

  let amountReceived: ReturnType<typeof toDecimal> | null = null;
  let changeGiven: ReturnType<typeof toDecimal> | null = null;

  if (input.paymentMethod === 'CASH') {
    if (input.amountReceived == null) {
      throw new ValidationError('Amount received is required for cash sales');
    }
    amountReceived = toDecimal(input.amountReceived);
    if (amountReceived.lt(grandTotal)) {
      throw new ValidationError('Amount received must be at least the bill total');
    }
    changeGiven = amountReceived.minus(grandTotal);
  } else if (input.paymentMethod === 'SPLIT' && (input.cashAmount ?? 0) > 0) {
    if (input.amountReceived == null) {
      throw new ValidationError('Amount received is required for the cash portion');
    }
    const cashDue = toDecimal(input.cashAmount ?? 0);
    amountReceived = toDecimal(input.amountReceived);
    if (amountReceived.lt(cashDue)) {
      throw new ValidationError('Amount received must cover the cash portion');
    }
    changeGiven = amountReceived.minus(cashDue);
  }

  if (input.paymentMethod === 'SPLIT') {
    const cash = toDecimal(input.cashAmount ?? 0);
    const credit = toDecimal(input.creditAmount ?? 0);
    const sum = cash.plus(credit);
    if (!sum.eq(grandTotal)) {
      throw new ValidationError(`Split amounts (${sum.toFixed(2)}) must equal grand total (${grandTotal.toFixed(2)})`);
    }
  }

  const lineItems = input.items.map((item, index) => {
    const product = productMap.get(item.productId)!;
    const calc = totals.lines[index]!;
    return {
      productId: product.id,
      productName: product.name,
      unitPrice: toDecimal(item.unitPrice ?? product.sellPrice),
      quantity: toDecimal(item.quantity),
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      lineTotal: calc.lineTotal,
      trackStock: product.trackStock,
    };
  });

  if (input.paymentMethod === 'CREDIT' && input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError('Customer not found');
  }

  const creditAmountForLimit =
    input.paymentMethod === 'CREDIT'
      ? grandTotal
      : input.paymentMethod === 'SPLIT'
        ? toDecimal(input.creditAmount ?? 0)
        : toDecimal(0);

  if (creditAmountForLimit.gt(0) && input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId, deletedAt: null },
    });
    if (customer?.creditLimit && customer.balance.plus(creditAmountForLimit).gt(customer.creditLimit)) {
      // soft warning returned in response
    }
  }

  const saleId = randomUUID();
  const settings = await getSettings(tenantId);

  const paymentStatus =
    input.paymentMethod === 'CREDIT'
      ? ('ON_CREDIT' as const)
      : input.paymentMethod === 'SPLIT' && (input.creditAmount ?? 0) > 0
        ? ('PARTIAL' as const)
        : ('PAID' as const);

  const sale = await prisma.$transaction(async (tx) => {
    const saleNumber = await nextSaleNumber(tx, tenantId);

    let invoiceNo: string | null = null;
    let qrData: string | null = null;
    if (settings.fbrEnabled && settings.fbrPosId) {
      invoiceNo = `${settings.fbrPosId}-${saleNumber}`;
      qrData = [
        'FBR',
        settings.fbrPosId,
        settings.fbrStrn ?? '',
        invoiceNo,
        new Date().toISOString(),
        grandTotal.toFixed(2),
        taxTotal.toFixed(2),
      ].join('|');
    }

    const created = await tx.sale.create({
      data: {
        id: saleId,
        tenantId,
        saleNumber,
        status: 'COMPLETED',
        customerId: input.customerId,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paymentStatus,
        notes: input.notes,
        cashierId,
        branchId: options?.branchId,
        fbrInvoiceNumber: invoiceNo,
        fbrQrData: qrData,
        amountReceived,
        changeGiven,
        items: {
          create: lineItems.map((li) => ({
            tenantId,
            productId: li.productId,
            productName: li.productName,
            unitPrice: li.unitPrice,
            quantity: li.quantity,
            discountAmount: li.discountAmount,
            taxAmount: li.taxAmount,
            lineTotal: li.lineTotal,
          })),
        },
      },
      include: { items: true },
    });

    let ledgerEntryId: string | null = null;
    const creditAmt =
      input.paymentMethod === 'CREDIT'
        ? grandTotal
        : input.paymentMethod === 'SPLIT'
          ? toDecimal(input.creditAmount ?? 0)
          : toDecimal(0);

    if (creditAmt.gt(0) && input.customerId) {
      ledgerEntryId = await recordCreditSale(tx, {
        tenantId,
        customerId: input.customerId,
        saleId: created.id,
        amount: creditAmt,
        recordedById: cashierId,
      });
    }

    if (input.paymentMethod === 'SPLIT') {
      const cashAmt = toDecimal(input.cashAmount ?? 0);
      if (cashAmt.gt(0)) {
        const cashPay = await tx.salePayment.create({
          data: { tenantId, saleId: created.id, paymentMethod: 'CASH', amount: cashAmt },
        });
        await syncInsert(tx, SYNC_TABLES.salePayments, cashPay);
      }
      if (creditAmt.gt(0)) {
        const creditPay = await tx.salePayment.create({
          data: {
            tenantId,
            saleId: created.id,
            paymentMethod: 'CREDIT',
            amount: creditAmt,
            ledgerEntryId,
          },
        });
        await syncInsert(tx, SYNC_TABLES.salePayments, creditPay);
      }
    } else {
      const payment = await tx.salePayment.create({
        data: {
          tenantId,
          saleId: created.id,
          paymentMethod: input.paymentMethod,
          amount: grandTotal,
          ledgerEntryId,
        },
      });
      await syncInsert(tx, SYNC_TABLES.salePayments, payment);
    }

    await syncInsert(tx, SYNC_TABLES.sales, created);
    for (const item of created.items) {
      await syncInsert(tx, SYNC_TABLES.saleItems, item);
    }

    if (input.appliedDiscounts?.length) {
      await recordDiscountUsages(tx, tenantId, created.id, input.appliedDiscounts);
    }

    for (const li of lineItems) {
      if (!li.trackStock) continue;

      const quantityAfter = await decrementProductStock(tx, {
        tenantId,
        productId: li.productId,
        quantity: li.quantity,
        productName: li.productName,
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: li.productId,
          movementType: 'SALE',
          quantityDelta: li.quantity.negated(),
          quantityAfter,
          referenceType: 'sale',
          referenceId: created.id,
          recordedById: cashierId,
          branchId: options?.branchId,
        },
      });

      const productRow = await tx.product.findUnique({ where: { id: li.productId } });
      await syncInsert(tx, SYNC_TABLES.stockMovements, movement);
      if (productRow) {
        await syncUpdate(tx, SYNC_TABLES.products, productRow);
      }
    }

    return created;
  });

  let creditLimitWarning: string | undefined;
  if (creditAmountForLimit.gt(0) && input.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (customer?.creditLimit && customer.balance.gt(customer.creditLimit)) {
      creditLimitWarning = `Customer balance (${customer.balance.toFixed(2)}) exceeds credit limit (${customer.creditLimit.toFixed(2)})`;
    }
  }

  return {
    sale: {
      id: sale.id,
      saleNumber: sale.saleNumber,
      grandTotal: sale.grandTotal.toFixed(2),
      paymentStatus: sale.paymentStatus,
      createdAt: sale.createdAt.toISOString(),
    },
    printReceipt: input.printReceipt ?? false,
    creditLimitWarning,
  };
}

export async function voidSale(
  tenantId: string,
  saleId: string,
  voidedById: string,
  voidReason: string,
  ipAddress?: string,
) {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true, payments: true },
    });

    if (!sale) throw new NotFoundError('Sale not found');
    if (sale.status === 'VOIDED') throw new ConflictError('Sale already voided');

    const voidedSale = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById,
        voidReason,
      },
    });
    await syncUpdate(tx, SYNC_TABLES.sales, voidedSale);

    for (const item of sale.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product?.trackStock) continue;

      const quantityAfter = await incrementProductStock(tx, {
        tenantId,
        productId: product.id,
        quantity: item.quantity,
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: product.id,
          movementType: 'RETURN',
          quantityDelta: item.quantity,
          quantityAfter,
          referenceType: 'sale_void',
          referenceId: saleId,
          notes: voidReason,
          recordedById: voidedById,
          branchId: sale.branchId,
        },
      });

      const productRow = await tx.product.findUnique({ where: { id: product.id } });
      await syncInsert(tx, SYNC_TABLES.stockMovements, movement);
      if (productRow) {
        await syncUpdate(tx, SYNC_TABLES.products, productRow);
      }
    }

    const creditPayment = sale.payments.find((p) => p.paymentMethod === 'CREDIT');
    if (creditPayment && sale.customerId) {
      await lockCustomerForUpdate(tx, tenantId, sale.customerId);

      const ledgerEntry = await tx.customerLedgerEntry.findFirst({
        where: { saleId, entryType: 'CREDIT_SALE', voidedAt: null },
      });

      if (ledgerEntry) {
        const voidedEntry = await tx.customerLedgerEntry.update({
          where: { id: ledgerEntry.id },
          data: { voidedAt: new Date(), voidedById, voidReason },
        });

        const reversalBalance = ledgerEntry.balanceAfter.minus(ledgerEntry.amount);
        const reversal = await tx.customerLedgerEntry.create({
          data: {
            tenantId,
            customerId: sale.customerId,
            entryType: 'VOID_REVERSAL',
            amount: ledgerEntry.amount.negated(),
            balanceAfter: reversalBalance,
            saleId,
            recordedById: voidedById,
            reversalOfId: ledgerEntry.id,
            notes: voidReason,
          },
        });

        const obligations = await tx.customerCreditObligation.findMany({ where: { saleId } });
        for (const obligation of obligations) {
          const updatedObligation = await tx.customerCreditObligation.update({
            where: { id: obligation.id },
            data: { remainingAmount: 0, closedAt: new Date() },
          });
          await syncUpdate(tx, SYNC_TABLES.customerCreditObligations, updatedObligation);
        }

        await syncUpdate(tx, SYNC_TABLES.customerLedgerEntries, voidedEntry);
        await syncInsert(tx, SYNC_TABLES.customerLedgerEntries, reversal);

        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: reversalBalance },
        });
      }
    }

    await writeAuditLog({
      tenantId,
      userId: voidedById,
      action: 'sale.voided',
      entityType: 'sale',
      entityId: saleId,
      metadata: { voidReason },
      ipAddress,
    });
  });

  return { success: true };
}

export async function getSaleDetail(tenantId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: {
      items: true,
      payments: true,
      customer: { select: { id: true, name: true, phone: true } },
      cashier: { select: { id: true, fullName: true } },
      returns: { include: { items: true } },
    },
  });
  if (!sale) throw new NotFoundError('Sale not found');

  const settings = await prisma.businessSettings.findUnique({ where: { tenantId } });

  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    status: sale.status,
    subtotal: sale.subtotal.toFixed(2),
    discountTotal: sale.discountTotal.toFixed(2),
    taxTotal: sale.taxTotal.toFixed(2),
    grandTotal: sale.grandTotal.toFixed(2),
    amountReceived: sale.amountReceived?.toFixed(2) ?? null,
    changeGiven: sale.changeGiven?.toFixed(2) ?? null,
    paymentStatus: sale.paymentStatus,
    notes: sale.notes,
    createdAt: sale.createdAt.toISOString(),
    voidedAt: sale.voidedAt?.toISOString() ?? null,
    voidReason: sale.voidReason,
    fbrInvoiceNumber: sale.fbrInvoiceNumber,
    fbrQrData: sale.fbrQrData,
    customer: sale.customer,
    cashier: sale.cashier,
    items: sale.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      unitPrice: i.unitPrice.toFixed(2),
      quantity: i.quantity.toFixed(3),
      discountAmount: i.discountAmount.toFixed(2),
      taxAmount: i.taxAmount.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2),
    })),
    payments: sale.payments.map((p) => ({
      id: p.id,
      paymentMethod: p.paymentMethod,
      amount: p.amount.toFixed(2),
    })),
    returns: sale.returns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      reason: r.reason,
      totalAmount: r.totalAmount.toFixed(2),
      createdAt: r.createdAt.toISOString(),
      items: r.items.map((ri) => ({
        id: ri.id,
        saleItemId: ri.saleItemId,
        productName: ri.productName,
        quantity: ri.quantity.toFixed(3),
        refundAmount: ri.refundAmount.toFixed(2),
      })),
    })),
    receipt: {
      businessName: settings?.businessName ?? 'POS',
      address: settings?.address,
      phone: settings?.phone,
      taxLabel: settings?.taxLabel ?? 'Tax',
      receiptFooter: settings?.receiptFooter,
      currency: settings?.currency ?? 'PKR',
      fbrEnabled: settings?.fbrEnabled ?? false,
      fbrPosId: settings?.fbrPosId ?? null,
      fbrStrn: settings?.fbrStrn ?? null,
      fbrRegisteredName: settings?.fbrRegisteredName ?? null,
      builtBy: BRAND.builtBy,
    },
  };
}

export const partialReturnSchema = z.object({
  reason: z.string().min(1),
  items: z.array(
    z.object({
      saleItemId: z.string().uuid(),
      quantity: z.number().positive(),
    }),
  ).min(1),
});

export async function partialReturn(
  tenantId: string,
  saleId: string,
  processedById: string,
  input: z.infer<typeof partialReturnSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, tenantId, status: 'COMPLETED' },
      include: { items: true },
    });
    if (!sale) throw new NotFoundError('Sale not found or not eligible for return');

    const returnCount = await tx.saleReturn.count({ where: { tenantId } });
    const returnNumber = `RET-${String(returnCount + 1).padStart(5, '0')}`;

    let totalRefund = toDecimal(0);
    const returnItems: Array<{
      saleItemId: string;
      productId: string;
      productName: string;
      quantity: ReturnType<typeof toDecimal>;
      refundAmount: ReturnType<typeof toDecimal>;
    }> = [];

    for (const req of input.items) {
      const saleItem = sale.items.find((i) => i.id === req.saleItemId);
      if (!saleItem) throw new NotFoundError(`Sale item ${req.saleItemId} not found`);
      const qty = toDecimal(req.quantity);
      if (qty.gt(saleItem.quantity)) {
        throw new ValidationError(`Return quantity exceeds sold quantity for ${saleItem.productName}`);
      }
      const unitRefund = saleItem.lineTotal.div(saleItem.quantity);
      const refundAmount = unitRefund.times(qty);
      totalRefund = totalRefund.plus(refundAmount);
      returnItems.push({
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        productName: saleItem.productName,
        quantity: qty,
        refundAmount,
      });
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        tenantId,
        saleId,
        returnNumber,
        reason: input.reason,
        totalAmount: totalRefund,
        processedById,
        items: {
          create: returnItems.map((ri) => ({
            tenantId,
            saleItemId: ri.saleItemId,
            productId: ri.productId,
            productName: ri.productName,
            quantity: ri.quantity,
            refundAmount: ri.refundAmount,
          })),
        },
      },
      include: { items: true },
    });

    for (const ri of returnItems) {
      const product = await tx.product.findUnique({ where: { id: ri.productId } });
      if (!product?.trackStock) continue;

      const quantityAfter = await incrementProductStock(tx, {
        tenantId,
        productId: product.id,
        quantity: ri.quantity,
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: product.id,
          movementType: 'RETURN',
          quantityDelta: ri.quantity,
          quantityAfter,
          referenceType: 'sale_return',
          referenceId: saleReturn.id,
          notes: input.reason,
          recordedById: processedById,
          branchId: sale.branchId,
        },
      });
    }

    return {
      id: saleReturn.id,
      returnNumber: saleReturn.returnNumber,
      totalAmount: saleReturn.totalAmount.toFixed(2),
      items: saleReturn.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity.toFixed(3),
        refundAmount: i.refundAmount.toFixed(2),
      })),
    };
  });
}

export async function listSales(tenantId: string, page = 1, pageSize = 20, branchId?: string) {
  const skip = (page - 1) * pageSize;
  const where = {
    tenantId,
    status: 'COMPLETED' as const,
    ...(branchId ? { branchId } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        saleNumber: true,
        grandTotal: true,
        paymentStatus: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    data: data.map((s) => ({
      ...s,
      grandTotal: s.grandTotal.toFixed(2),
      createdAt: s.createdAt.toISOString(),
    })),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  };
}
