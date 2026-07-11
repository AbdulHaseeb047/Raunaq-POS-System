import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ReceiptView } from '@/components/billing/ReceiptView';
import { IconSearch, IconWallet } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ApiError, api } from '@/lib/api-client';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { printSaleReceipt } from '@/lib/print-receipt';
import { calcSaleTotals, canAddToCart, getStockStatus } from '@/lib/sale-utils';
import type { Customer, HeldCart, Product, SaleDetail } from '@/types/api';

interface CartLine {
  product: Product;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

type PaymentMode = 'CASH' | 'CREDIT' | 'SPLIT';

function roundUpToStep(amount: number, step: number): number {
  if (amount <= 0) return step;
  return Math.ceil(amount / step) * step;
}

function summarizeHeldCart(data: Record<string, unknown>) {
  const cart = (data.cart as CartLine[] | undefined) ?? [];
  const customer = data.customer as Customer | undefined;
  const billDiscount = Number(data.billDiscount) || 0;
  const heldTotal = Number(data.heldTotal);
  const lineCount = cart.length;
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const computedSubtotal = cart.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount,
    0,
  );
  return {
    customerName: customer?.name ?? 'Walk-in',
    lineCount,
    itemCount,
    total: Number.isFinite(heldTotal) ? heldTotal : Math.max(0, computedSubtotal - billDiscount),
  };
}

export function SalePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [cashAmount, setCashAmount] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [billDiscount, setBillDiscount] = useState(0);
  const [discountInput, setDiscountInput] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [appliedDiscounts, setAppliedDiscounts] = useState<Array<{ ruleId: string; amount: number }>>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [receiptSale, setReceiptSale] = useState<SaleDetail | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [holdMessage, setHoldMessage] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteHeldTarget, setDeleteHeldTarget] = useState<HeldCart | null>(null);

  const canDiscount = hasFeature(user, FEATURES.BILLING_DISCOUNT);
  const canDiscountUnlimited = hasFeature(user, FEATURES.BILLING_DISCOUNT_UNLIMITED);
  const canPrint = hasFeature(user, FEATURES.BILLING_PRINT_RECEIPT);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
  const { data: discountRules } = useQuery({
    queryKey: ['discounts', 'active'],
    queryFn: () => api.discounts.list(false),
    enabled: canDiscount,
  });
  const { data: products } = useQuery({
    queryKey: ['products', 'sale', search, categoryId],
    queryFn: () =>
      api.products.list({
        search: search || undefined,
        categoryId: categoryId || undefined,
        pageSize: 30,
      }),
    enabled: search.length >= 1 || !!categoryId,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers', 'sale', customerSearch],
    queryFn: () => api.customers.list(customerSearch || undefined, 1, 15),
    enabled: customerSearch.length >= 1,
  });
  const { data: heldCarts, refetch: refetchHeld } = useQuery({
    queryKey: ['held-carts'],
    queryFn: () => api.heldCarts.list(),
  });

  const defaultTax = parseFloat(settings?.defaultTaxRate ?? '0');
  const currency = settings?.currency ?? 'PKR';
  const maxDiscountPercent = settings?.maxDiscountPercentStaff
    ? parseFloat(settings.maxDiscountPercentStaff)
    : null;

  const totals = useMemo(
    () => calcSaleTotals(cart, billDiscount, defaultTax),
    [cart, billDiscount, defaultTax],
  );

  const creditLimitWarning = useMemo(() => {
    if (!customer?.creditLimit || paymentMode === 'CASH') return null;
    const limit = parseFloat(customer.creditLimit);
    const balance = parseFloat(customer.balance);
    const creditPart =
      paymentMode === 'CREDIT'
        ? totals.grandTotal
        : paymentMode === 'SPLIT'
          ? parseFloat(creditAmount) || 0
          : 0;
    if (creditPart <= 0) return null;
    if (balance + creditPart > limit) {
      return `Udhaar limit cross: ${formatMoney(balance + creditPart, currency)} / ${formatMoney(limit, currency)}`;
    }
    return null;
  }, [customer, paymentMode, totals.grandTotal, creditAmount, currency]);

  const addToCart = useCallback(
    (product: Product) => {
      const existing = cart.find((l) => l.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      if (!canAddToCart(product, 1, currentQty)) {
        setError(`${product.name} is out of stock`);
        return;
      }
      setError('');
      setCart((prev) => {
        const ex = prev.find((l) => l.product.id === product.id);
        if (ex) {
          return prev.map((l) =>
            l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
        return [
          ...prev,
          { product, quantity: 1, unitPrice: parseFloat(product.sellPrice), discountAmount: 0 },
        ];
      });
      setSearch('');
      setShowDropdown(false);
      searchRef.current?.focus();
    },
    [cart],
  );

  const applyDiscountRule = useCallback(
    (ruleId: string) => {
      const rule = discountRules?.find((r) => r.id === ruleId);
      if (!rule) return;
      setSelectedRuleId(ruleId);

      if (rule.appliesTo === 'BILL') {
        const min = rule.minBillAmount ? parseFloat(rule.minBillAmount) : 0;
        if (totals.subtotal < min) {
          setError(`Minimum bill ${formatMoney(min, currency)} required for this rule`);
          return;
        }
        const val = parseFloat(rule.value);
        const disc =
          rule.discountType === 'PERCENTAGE' ? (totals.subtotal * val) / 100 : val;
        setBillDiscount(Math.round(disc * 100) / 100);
        setDiscountInput('');
        setAppliedDiscounts((prev) => {
          const filtered = prev.filter((a) => a.ruleId !== ruleId);
          return [...filtered, { ruleId, amount: Math.round(disc * 100) / 100 }];
        });
        setError('');
        return;
      }

      const lineDiscounts = new Map<string, number>();
      for (const line of cart) {
        const match =
          (rule.productId && rule.productId === line.product.id) ||
          (rule.categoryId && line.product.category?.id === rule.categoryId);
        if (!match) continue;
        const lineSub = line.quantity * line.unitPrice;
        const val = parseFloat(rule.value);
        const disc = rule.discountType === 'PERCENTAGE' ? (lineSub * val) / 100 : val;
        lineDiscounts.set(line.product.id, (lineDiscounts.get(line.product.id) ?? 0) + disc);
      }
      setCart((prev) =>
        prev.map((l) => ({
          ...l,
          discountAmount: lineDiscounts.get(l.product.id) ?? l.discountAmount,
        })),
      );
      setError('');
    },
    [cart, discountRules, totals.subtotal, currency],
  );

  const applyManualDiscount = () => {
    const val = parseFloat(discountInput) || 0;
    if (val <= 0) return;
    let disc = val;
    if (!canDiscountUnlimited && maxDiscountPercent != null) {
      const maxAllowed = (totals.subtotal * maxDiscountPercent) / 100;
      if (disc > maxAllowed) {
        setError(`Max discount allowed: ${maxDiscountPercent}% (${formatMoney(maxAllowed, currency)})`);
        disc = maxAllowed;
      }
    }
    setBillDiscount(Math.round(disc * 100) / 100);
    setSelectedRuleId('');
    setAppliedDiscounts([]);
    setError('');
  };

  const handleBarcode = async (value: string) => {
    if (!value.trim()) return;
    try {
      addToCart(await api.products.byBarcode(value.trim()));
    } catch {
      setSearch(value);
      setShowDropdown(true);
    }
  };

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter' && barcodeBuffer.current.length >= 4) {
        void handleBarcode(barcodeBuffer.current);
        barcodeBuffer.current = '';
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 100);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addToCart]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (paymentMode === 'SPLIT') {
      const credit = parseFloat(creditAmount) || 0;
      if (credit > 0) {
        setCashAmount(String(Math.max(0, Math.round((totals.grandTotal - credit) * 100) / 100)));
      }
    } else if (paymentMode === 'CREDIT') {
      setCreditAmount(String(totals.grandTotal));
      setCashAmount('0');
    }
  }, [paymentMode, totals.grandTotal]);

  const availablePaymentModes = useMemo((): PaymentMode[] => {
    if (!customer) return ['CASH'];
    return ['CASH', 'CREDIT', 'SPLIT'];
  }, [customer]);

  useEffect(() => {
    if (!availablePaymentModes.includes(paymentMode)) {
      setPaymentMode('CASH');
      setAmountReceived('');
      setCashAmount('');
      setCreditAmount('');
    }
  }, [availablePaymentModes, paymentMode]);

  const clearSale = () => {
    setCart([]);
    setCustomer(null);
    setCustomerSearch('');
    setBillDiscount(0);
    setDiscountInput('');
    setSelectedRuleId('');
    setAppliedDiscounts([]);
    setNotes('');
    setPaymentMode('CASH');
    setCashAmount('');
    setCreditAmount('');
    setAmountReceived('');
    setError('');
    setWarning('');
    setConfirmCancel(false);
  };

  const cancelSale = () => {
    if (cart.length === 0) return;
    setConfirmCancel(true);
  };

  const completeSale = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        customerId: customer?.id,
        paymentMethod: paymentMode === 'SPLIT' ? 'SPLIT' : paymentMode,
        items: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
        })),
        billDiscountAmount: billDiscount,
        appliedDiscounts: appliedDiscounts.length > 0 ? appliedDiscounts : undefined,
        notes: notes || undefined,
        printReceipt: settings?.printReceiptsDefault ?? false,
      };
      if (paymentMode === 'SPLIT') {
        body.cashAmount = parseFloat(cashAmount) || 0;
        body.creditAmount = parseFloat(creditAmount) || 0;
      }
      if (paymentMode === 'CASH' || (paymentMode === 'SPLIT' && (parseFloat(cashAmount) || 0) > 0)) {
        body.amountReceived = parseFloat(amountReceived) || 0;
      }
      return api.sales.create(body);
    },
    onSuccess: async (result) => {
      if (result.creditLimitWarning) setWarning(result.creditLimitWarning);
      const detail = await api.sales.get(result.sale.id);
      setReceiptSale(detail);
      setShowCheckout(false);
      if (canPrint && settings?.printReceiptsDefault) {
        void printSaleReceipt(detail, settings, currency).catch((err) => {
          setWarning(err instanceof Error ? err.message : 'Receipt print failed');
        });
      }
      setCart([]);
      setCustomer(null);
      setBillDiscount(0);
      setDiscountInput('');
      setSelectedRuleId('');
      setAppliedDiscounts([]);
      setNotes('');
      setPaymentMode('CASH');
      setAmountReceived('');
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Sale failed'),
  });

  const holdCart = useMutation({
    mutationFn: (name: string) =>
      api.heldCarts.save({
        name: name.trim() || `Hold ${new Date().toLocaleTimeString()}`,
        cartData: {
          cart,
          customer,
          customerSearch,
          paymentMode,
          billDiscount,
          discountInput,
          selectedRuleId,
          appliedDiscounts,
          notes,
          cashAmount,
          creditAmount,
          heldTotal: totals.grandTotal,
        },
      }),
    onSuccess: () => {
      setCart([]);
      setCustomer(null);
      setCustomerSearch('');
      setBillDiscount(0);
      setDiscountInput('');
      setSelectedRuleId('');
      setAppliedDiscounts([]);
      setNotes('');
      setAmountReceived('');
      setShowHoldModal(false);
      setHoldLabel('');
      setHoldMessage('Bill held — you can resume it from Held Bills.');
      setTimeout(() => setHoldMessage(''), 4000);
      void refetchHeld();
    },
  });

  const deleteHeld = useMutation({
    mutationFn: (id: string) => api.heldCarts.delete(id),
    onSuccess: () => {
      setDeleteHeldTarget(null);
      void refetchHeld();
    },
  });

  const resumeHeld = (held: HeldCart) => {
    const data = held.cartData as {
      cart?: CartLine[];
      customer?: Customer;
      customerSearch?: string;
      paymentMode?: PaymentMode;
      paymentMethod?: string;
      billDiscount?: number;
      discountInput?: string;
      selectedRuleId?: string;
      appliedDiscounts?: Array<{ ruleId: string; amount: number }>;
      notes?: string;
      cashAmount?: string;
      creditAmount?: string;
    };
    if (data.cart) setCart(data.cart);
    if (data.customer) setCustomer(data.customer);
    if (data.customerSearch) setCustomerSearch(data.customerSearch);
    else if (data.customer) setCustomerSearch(data.customer.name);
    else setCustomerSearch('');
    if (data.paymentMode) setPaymentMode(data.paymentMode);
    else if (data.paymentMethod === 'CREDIT') setPaymentMode('CREDIT');
    else if (data.paymentMethod === 'SPLIT') setPaymentMode('SPLIT');
    if (data.billDiscount) setBillDiscount(data.billDiscount);
    if (data.discountInput) setDiscountInput(data.discountInput);
    if (data.selectedRuleId) setSelectedRuleId(data.selectedRuleId);
    if (data.appliedDiscounts) setAppliedDiscounts(data.appliedDiscounts);
    if (data.notes) setNotes(data.notes);
    if (data.cashAmount) setCashAmount(data.cashAmount);
    if (data.creditAmount) setCreditAmount(data.creditAmount);
    setAmountReceived('');
    setError('');
    void api.heldCarts.delete(held.id).then(() => refetchHeld());
    setShowHeld(false);
    searchRef.current?.focus();
  };

  const searchResults = products?.data ?? [];
  const cashDue = useMemo(() => {
    if (paymentMode === 'CASH') return totals.grandTotal;
    if (paymentMode === 'SPLIT') return parseFloat(cashAmount) || 0;
    return 0;
  }, [paymentMode, totals.grandTotal, cashAmount]);

  const changeDue = useMemo(() => {
    const received = parseFloat(amountReceived) || 0;
    if (cashDue <= 0 || received < cashDue) return 0;
    return Math.round((received - cashDue) * 100) / 100;
  }, [amountReceived, cashDue]);

  const needsCashTender =
    paymentMode === 'CASH' || (paymentMode === 'SPLIT' && (parseFloat(cashAmount) || 0) > 0);
  const cashTenderOk = !needsCashTender || (parseFloat(amountReceived) || 0) >= cashDue;

  const canAuthorize =
    cart.length > 0 &&
    cashTenderOk &&
    (paymentMode !== 'CREDIT' || !!customer) &&
    (paymentMode !== 'SPLIT' || !!customer);
  const canOpenCheckout =
    cart.length > 0 &&
    (paymentMode !== 'CREDIT' || !!customer) &&
    (paymentMode !== 'SPLIT' || !!customer);
  const activeCategories = categoryId || search.length >= 1 ? searchResults : [];
  const selectedCustomerLabel = customer?.name ?? 'Walk-in Customer (Cash Sale)';

  const paymentModeLabels: Record<PaymentMode, string> = {
    CASH: 'Cash Sale',
    CREDIT: 'Full Udhaar',
    SPLIT: 'Split Udhaar',
  };

  const openCheckout = () => {
    setError('');
    if (!canOpenCheckout) {
      setError('Customer is required for udhaar or split payment.');
      return;
    }
    setAmountReceived('');
    setShowCheckout(true);
  };

  const openHoldModal = () => {
    if (cart.length === 0) return;
    const defaultName = customer?.name ?? `Hold ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setHoldLabel(defaultName);
    setShowHoldModal(true);
  };

  const setQuickTender = (value: number) => {
    setAmountReceived(String(Math.max(value, cashDue)));
  };

  const customerDisplay = customerSearch || (customer ? customer.name : '');

  return (
    <div className="relative flex h-[calc(100vh-7rem)] flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-text">Sales Register</h1>
        <div className="flex flex-wrap gap-2">
          {(heldCarts?.length ?? 0) > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setShowHeld(true)}>
              Held bills ({heldCarts?.length})
            </Button>
          )}
          {cart.length > 0 && (
            <>
              <Button size="sm" variant="secondary" onClick={openHoldModal}>
                Hold bill
              </Button>
              <Button size="sm" variant="danger" onClick={cancelSale}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {holdMessage && (
        <div className="mb-3 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
          {holdMessage}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <Card className="border-border/80 bg-white" padding="md">
            <div className="relative" ref={dropdownRef}>
              <IconSearch className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                ref={searchRef}
                className="w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                placeholder="Search by Name, SKU code or scan Barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults[0]) addToCart(searchResults[0]);
                  if (e.key === 'Enter' && search.trim()) void handleBarcode(search);
                }}
              />
              {showDropdown && search.length >= 1 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                  {searchResults.length === 0 && (
                    <p className="px-3 py-2 text-xs text-text-muted">No products found</p>
                  )}
                  {searchResults.map((p) => {
                    const status = getStockStatus(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={status === 'out'}
                        onClick={() => addToCart(p)}
                        className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2 text-left hover:bg-brand-50 disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-[11px] text-text-muted">
                            {p.sku ?? '—'} {p.barcode && `· ${p.barcode}`}
                          </p>
                        </div>
                        <div className="ml-3 text-right">
                          <p className="text-sm font-semibold text-brand-700">{formatMoney(p.sellPrice, currency)}</p>
                          {p.trackStock && (
                            <Badge variant={status === 'low' ? 'warning' : status === 'out' ? 'danger' : 'default'}>
                              {p.stockQuantity}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryId('')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  !categoryId ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-white text-text'
                }`}
              >
                All
              </button>
              {(categories ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    categoryId === c.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-white text-text'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Card>

          <Card className="bg-white" padding="md">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Products</h3>
              <span className="text-xs text-text-muted">{activeCategories.length} items</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {activeCategories.map((p) => {
                const status = getStockStatus(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={status === 'out'}
                    onClick={() => addToCart(p)}
                    className="flex min-h-[116px] flex-col rounded-2xl border border-border bg-surface p-3 text-left transition hover:border-brand-300 hover:shadow-sm disabled:opacity-50"
                  >
                    <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                      {p.category?.name ?? 'General'}
                    </span>
                    <span className="mt-2 line-clamp-2 text-sm font-semibold">{p.name}</span>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3 text-xs">
                      <div>
                        <span className="block font-semibold text-brand-700">{formatMoney(p.sellPrice, currency)}</span>
                        <span className="text-[11px] text-text-muted">/ {p.unit}</span>
                      </div>
                      {p.trackStock && (
                        <Badge variant={status === 'low' ? 'warning' : 'default'}>
                          {p.stockQuantity}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {!categoryId && !search && (
              <p className="py-10 text-center text-sm text-text-muted">Search or choose a category to start.</p>
            )}
          </Card>
        </div>

        <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-white shadow-sm">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconWallet className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-bold text-text">Shopping Cart</h3>
                <Badge variant="brand">{cart.length}</Badge>
              </div>
              {cart.length > 0 && (
                <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={cancelSale}>
                  Clear
                </button>
              )}
            </div>

            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Walk-in Customer (Cash Sale)"
                value={customerDisplay}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomerSearch(v);
                  if (!v) {
                    setCustomer(null);
                    setPaymentMode('CASH');
                  }
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
              />
              {showCustomerDropdown && customerSearch && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                  {(customers?.data ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-brand-50"
                      onClick={() => {
                        setCustomer(c);
                        setCustomerSearch(c.name);
                        setShowCustomerDropdown(false);
                      }}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-text-muted"> · {c.phone}</span>}
                    </button>
                  ))}
                  {(customers?.data ?? []).length === 0 && (
                    <p className="px-3 py-2 text-xs text-text-muted">No customer found. Add from Udhaar page.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-[120px] items-center justify-center">
                <p className="text-center text-xs text-text-muted">Add products from the register</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((line) => (
                  <div key={line.product.id} className="rounded-xl border border-border/80 bg-surface-muted/60 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium leading-tight">{line.product.name}</p>
                      <button
                        type="button"
                        className="shrink-0 text-[10px] text-danger"
                        onClick={() => setCart((c) => c.filter((l) => l.product.id !== line.product.id))}
                      >
                        ✕
                      </button>
                    </div>
                    <p className="mt-0.5 text-[10px] text-text-muted">
                      {formatMoney(line.unitPrice, currency)} × {line.quantity}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-sm font-bold"
                        onClick={() =>
                          setCart((c) =>
                            c.map((l) =>
                              l.product.id === line.product.id ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l,
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <span className="min-w-[24px] text-center text-sm font-semibold">{line.quantity}</span>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-sm font-bold"
                        onClick={() => {
                          if (canAddToCart(line.product, 1, line.quantity)) {
                            setCart((c) =>
                              c.map((l) =>
                                l.product.id === line.product.id ? { ...l, quantity: l.quantity + 1 } : l,
                              ),
                            );
                          } else setError('Insufficient stock');
                        }}
                      >
                        +
                      </button>
                      <span className="ml-auto text-sm font-bold text-brand-700">
                        {formatMoney(line.quantity * line.unitPrice - line.discountAmount, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-surface-muted/40 px-4 py-3">
            {canDiscount && (
              <div className="mb-3 flex gap-2">
                {discountRules && discountRules.length > 0 ? (
                  <Select
                    value={selectedRuleId}
                    onChange={(e) => applyDiscountRule(e.target.value)}
                    options={[
                      { value: '', label: 'Discount rule...' },
                      ...discountRules.map((r) => ({
                        value: r.id,
                        label: `${r.name} (${r.discountType === 'PERCENTAGE' ? `${r.value}%` : `Rs ${r.value}`})`,
                      })),
                    ]}
                    className="flex-1"
                  />
                ) : (
                  <Input
                    type="number"
                    min={0}
                    className="flex-1"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="Discount"
                  />
                )}
                <Button size="sm" variant="secondary" onClick={applyManualDiscount}>
                  Apply
                </Button>
              </div>
            )}

            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-text-muted">
                <span>Subtotal</span>
                <span>{formatMoney(totals.subtotal, currency)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-danger">
                  <span>Discount</span>
                  <span>−{formatMoney(totals.discountTotal, currency)}</span>
                </div>
              )}
              {totals.taxTotal > 0 && (
                <div className="flex justify-between text-text-muted">
                  <span>{settings?.taxLabel ?? 'Tax'}</span>
                  <span>{formatMoney(totals.taxTotal, currency)}</span>
                </div>
              )}
            </div>

            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Grand Total</span>
              <span className="text-2xl font-black text-brand-800">{formatMoney(totals.grandTotal, currency)}</span>
            </div>

            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            {warning && <p className="mt-1 text-xs text-amber-700">{warning}</p>}

            <Button
              className="mt-3 w-full"
              size="lg"
              variant="accent"
              disabled={cart.length === 0}
              onClick={openCheckout}
            >
              Proceed to Payment
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={showCheckout}
        onClose={() => setShowCheckout(false)}
        title="Payment Checkout"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCheckout(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={completeSale.isPending}
              disabled={!canAuthorize}
              onClick={() => {
                setError('');
                if (!cashTenderOk) {
                  setError('Enter the amount received from the customer.');
                  return;
                }
                completeSale.mutate();
              }}
            >
              Authorize Checkout
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-2xl bg-slate-700 px-5 py-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">Invoice Total</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-200">Customer: {selectedCustomerLabel}</p>
              </div>
              <p className="text-4xl font-bold">{formatMoney(totals.grandTotal, currency)}</p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Select Payment Mode</p>
            {!customer && (
              <p className="mb-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-text-muted">
                Walk-in sale — cash only. Select an udhaar customer to enable credit options.
              </p>
            )}
            <div className={`grid gap-3 ${availablePaymentModes.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {availablePaymentModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    setAmountReceived('');
                  }}
                  className={`rounded-2xl border px-4 py-5 text-center transition ${
                    paymentMode === mode
                      ? 'border-brand-700 bg-brand-50 shadow-sm'
                      : 'border-border bg-surface-muted'
                  }`}
                >
                  <div className="mb-2 flex justify-center">
                    <IconWallet className={`h-5 w-5 ${paymentMode === mode ? 'text-brand-700' : 'text-text-muted'}`} />
                  </div>
                  <p className={`text-sm font-semibold ${paymentMode === mode ? 'text-brand-800' : 'text-text'}`}>
                    {paymentModeLabels[mode]}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {paymentMode === 'CASH' && (
            <div className="rounded-2xl border border-slate-400 px-4 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Amount received from customer ({currency})
              </p>
              <Input
                type="number"
                min={cashDue}
                step="1"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder={`Due: ${formatMoney(cashDue, currency)}`}
                autoFocus
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" type="button" onClick={() => setQuickTender(cashDue)}>
                  Exact
                </Button>
                {[500, 1000, 5000].map((note) => (
                  <Button
                    key={note}
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setQuickTender(roundUpToStep(cashDue, note))}
                  >
                    {formatMoney(note, currency)}
                  </Button>
                ))}
              </div>
              {parseFloat(amountReceived) > 0 && (
                <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="flex justify-between text-sm text-emerald-900">
                    <span>Bill total</span>
                    <span className="font-semibold">{formatMoney(cashDue, currency)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm text-emerald-900">
                    <span>Received</span>
                    <span className="font-semibold">{formatMoney(amountReceived, currency)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-emerald-200 pt-2 text-lg font-black text-emerald-800">
                    <span>Change back</span>
                    <span>{formatMoney(changeDue, currency)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {paymentMode === 'CREDIT' && (
            <div className="rounded-2xl border border-border bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Full invoice will be posted to customer udhaar.
            </div>
          )}

          {paymentMode === 'SPLIT' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={`Cash (${currency})`}
                  type="number"
                  value={cashAmount}
                  onChange={(e) => {
                    const cash = parseFloat(e.target.value) || 0;
                    setCashAmount(e.target.value);
                    setCreditAmount(String(Math.max(0, totals.grandTotal - cash)));
                    setAmountReceived('');
                  }}
                />
                <Input
                  label={`Udhaar (${currency})`}
                  type="number"
                  value={creditAmount}
                  onChange={(e) => {
                    const credit = parseFloat(e.target.value) || 0;
                    setCreditAmount(e.target.value);
                    setCashAmount(String(Math.max(0, totals.grandTotal - credit)));
                    setAmountReceived('');
                  }}
                />
              </div>
              {(parseFloat(cashAmount) || 0) > 0 && (
                <div className="rounded-2xl border border-slate-400 px-4 py-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Cash received ({currency})
                  </p>
                  <Input
                    type="number"
                    min={cashDue}
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder={`Cash due: ${formatMoney(cashDue, currency)}`}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" type="button" onClick={() => setQuickTender(cashDue)}>
                      Exact cash
                    </Button>
                  </div>
                  {parseFloat(amountReceived) > 0 && changeDue > 0 && (
                    <p className="mt-3 text-sm font-bold text-emerald-700">
                      Change back: {formatMoney(changeDue, currency)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {creditLimitWarning && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              {creditLimitWarning}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={!!receiptSale}
        onClose={() => setReceiptSale(null)}
        title="Sale completed"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiptSale(null)}>
              Skip receipt
            </Button>
            {canPrint && (
            <Button
              variant="secondary"
              onClick={() => {
                if (!receiptSale || !settings) return;
                void printSaleReceipt(receiptSale, settings, currency).catch((err) => {
                  setError(err instanceof Error ? err.message : 'Receipt print failed');
                });
              }}
            >
              Print receipt
            </Button>
            )}
            <Button onClick={() => setReceiptSale(null)}>Done</Button>
          </>
        }
      >
        {receiptSale && <ReceiptView sale={receiptSale} currency={currency} />}
      </Modal>

      <Modal
        open={showHoldModal}
        onClose={() => setShowHoldModal(false)}
        title="Hold this bill"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowHoldModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={holdCart.isPending}
              onClick={() => holdCart.mutate(holdLabel)}
            >
              Hold bill
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Bill label"
            value={holdLabel}
            onChange={(e) => setHoldLabel(e.target.value)}
            placeholder="e.g. Table 3, Ahmed, or quick note"
          />
          <div className="rounded-xl border border-border bg-surface-muted/60 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Customer</span>
              <span className="font-medium">{customer?.name ?? 'Walk-in'}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-text-muted">Items</span>
              <span className="font-medium">
                {cart.length} lines · {cart.reduce((s, l) => s + l.quantity, 0)} pcs
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span>
              <span className="text-brand-800">{formatMoney(totals.grandTotal, currency)}</span>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            The cart will be cleared and saved under Held bills. Resume it anytime from the top bar.
          </p>
        </div>
      </Modal>

      <Modal open={showHeld} onClose={() => setShowHeld(false)} title="Held bills" size="lg">
        <div className="space-y-3">
          {(heldCarts ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-text-muted">No held bills right now.</p>
          )}
          {(heldCarts ?? []).map((h) => {
            const summary = summarizeHeldCart(h.cartData);
            return (
              <div
                key={h.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text">{h.name ?? 'Held bill'}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {summary.customerName} · {summary.lineCount} items ({summary.itemCount} pcs)
                  </p>
                  <p className="text-xs text-text-muted">{new Date(h.updatedAt).toLocaleString()}</p>
                  <p className="mt-1 text-sm font-bold text-brand-700">{formatMoney(summary.total, currency)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => resumeHeld(h)}>
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    loading={deleteHeld.isPending}
                    onClick={() => setDeleteHeldTarget(h)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={clearSale}
        title="Cancel current sale?"
        message="The cart will be cleared and all items removed. This cannot be undone."
        confirmLabel="Clear cart"
      />

      <ConfirmDialog
        open={deleteHeldTarget != null}
        onClose={() => setDeleteHeldTarget(null)}
        onConfirm={() => {
          if (deleteHeldTarget) deleteHeld.mutate(deleteHeldTarget.id);
        }}
        title="Delete held bill"
        message={
          deleteHeldTarget ? (
            <>
              Delete held bill <strong className="text-text">{deleteHeldTarget.name ?? 'Untitled'}</strong>?
              This cannot be recovered.
            </>
          ) : null
        }
        confirmLabel="Delete bill"
        loading={deleteHeld.isPending}
      />
    </div>
  );
}
