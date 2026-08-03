/** Per-user receipt behavior overrides (browser). Shop settings are the fallback. */

export type ReceiptAfterSalePrefs = {
  /** When set, overrides shop showReceiptAfterSale */
  showReceiptAfterSale?: boolean;
  /** When set, overrides shop printReceiptsDefault */
  printReceiptsDefault?: boolean;
};

function storageKey(userId: string): string {
  return `pos_receipt_after_sale_${userId}`;
}

export function loadReceiptPrefs(userId: string | null | undefined): ReceiptAfterSalePrefs {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReceiptAfterSalePrefs;
    return {
      showReceiptAfterSale:
        typeof parsed.showReceiptAfterSale === 'boolean' ? parsed.showReceiptAfterSale : undefined,
      printReceiptsDefault:
        typeof parsed.printReceiptsDefault === 'boolean' ? parsed.printReceiptsDefault : undefined,
    };
  } catch {
    return {};
  }
}

export function saveReceiptPrefs(userId: string, prefs: ReceiptAfterSalePrefs): void {
  const next: ReceiptAfterSalePrefs = {};
  if (typeof prefs.showReceiptAfterSale === 'boolean') {
    next.showReceiptAfterSale = prefs.showReceiptAfterSale;
  }
  if (typeof prefs.printReceiptsDefault === 'boolean') {
    next.printReceiptsDefault = prefs.printReceiptsDefault;
  }
  if (Object.keys(next).length === 0) {
    localStorage.removeItem(storageKey(userId));
    return;
  }
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
}

export function clearReceiptPrefs(userId: string): void {
  localStorage.removeItem(storageKey(userId));
}

export function resolveReceiptAfterSale(options: {
  userId?: string | null;
  shopShow?: boolean | null;
  shopPrint?: boolean | null;
  canPrint: boolean;
}): { showReceipt: boolean; autoPrint: boolean } {
  const personal = loadReceiptPrefs(options.userId);
  const showReceipt = personal.showReceiptAfterSale ?? options.shopShow ?? true;
  const autoPrint =
    options.canPrint && (personal.printReceiptsDefault ?? options.shopPrint ?? false);
  return { showReceipt, autoPrint };
}
