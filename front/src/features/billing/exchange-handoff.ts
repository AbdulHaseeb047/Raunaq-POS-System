/** Navigation state passed from Sales History → Sale after an exchange return. */
export type ExchangeSaleLocationState = {
  exchangeFromSaleNumber: string;
  customerId: string | null;
  customerName: string | null;
  /** Refund/credit amount as a decimal string from the return API. */
  creditHint: string;
};

export function isExchangeSaleLocationState(value: unknown): value is ExchangeSaleLocationState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.exchangeFromSaleNumber === 'string' && v.exchangeFromSaleNumber.length > 0;
}
