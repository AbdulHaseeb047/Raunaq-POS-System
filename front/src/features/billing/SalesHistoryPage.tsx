import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ReceiptView } from '@/components/billing/ReceiptView';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api-client';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { printSaleReceipt } from '@/lib/print-receipt';
import { downloadSaleInvoicePdf, downloadSalesReportPdf } from '@/lib/sales-pdf';
import type { SaleDetail, SaleListItem } from '@/types/api';

const PAGE_SIZE = 15;

function paymentLabel(sale: SaleListItem) {
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments.map((p) => p.paymentMethod).join(', ');
  }
  return sale.paymentStatus;
}

function paymentBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  const s = status.toUpperCase();
  if (s.includes('PAID') || s === 'CASH') return 'success';
  if (s.includes('PARTIAL') || s.includes('UDHAAR') || s.includes('CREDIT')) return 'warning';
  if (s.includes('VOID')) return 'danger';
  return 'default';
}

export function SalesHistoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const returnPanelRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [panel, setPanel] = useState<'receipt' | 'return' | 'void'>('receipt');
  const [voidReason, setVoidReason] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);

  const canReturn = hasFeature(user, FEATURES.BILLING_CREATE_SALE);
  const canVoid = hasFeature(user, FEATURES.BILLING_VOID_SALE);
  const canPrint = hasFeature(user, FEATURES.BILLING_PRINT_RECEIPT);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 200);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['sales', page, debouncedSearch],
    queryFn: () => api.sales.list(page, PAGE_SIZE, debouncedSearch || undefined),
    placeholderData: (prev) => prev,
  });

  const openInvoice = async (saleId: string, startPanel: 'receipt' | 'return' = 'receipt') => {
    setLoadingDetail(true);
    setPanel(startPanel);
    try {
      setSelected(await api.sales.get(saleId));
      setVoidReason('');
      setReturnQty({});
      setReturnReason('');
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeInvoice = () => {
    setSelected(null);
    setPanel('receipt');
    setConfirmVoid(false);
    setConfirmReturn(false);
  };

  const voidSale = useMutation({
    mutationFn: () => api.sales.void(selected!.id, voidReason),
    onSuccess: () => {
      closeInvoice();
      setVoidReason('');
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const partialReturn = useMutation({
    mutationFn: () =>
      api.sales.return(selected!.id, {
        reason: returnReason,
        items: Object.entries(returnQty)
          .filter(([, q]) => q > 0)
          .map(([saleItemId, quantity]) => ({ saleItemId, quantity })),
      }),
    onSuccess: async () => {
      if (selected) {
        const refreshed = await api.sales.get(selected.id);
        setSelected(refreshed);
      }
      setReturnQty({});
      setReturnReason('');
      setConfirmReturn(false);
      setPanel('receipt');
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const currency = settings?.currency ?? 'PKR';
  const sales = data?.data ?? [];
  const meta = data?.meta;

  const canReturnSelected = useMemo(() => {
    if (!selected || selected.status !== 'COMPLETED' || !canReturn) return false;
    return selected.items.some((item) => parseFloat(item.returnableQuantity ?? item.quantity) > 0);
  }, [selected, canReturn]);

  const estimatedRefund = useMemo(() => {
    if (!selected) return 0;
    return selected.items.reduce((sum, item) => {
      const qty = returnQty[item.id] ?? 0;
      if (qty <= 0) return sum;
      const sold = parseFloat(item.quantity);
      const unit = sold > 0 ? parseFloat(item.lineTotal) / sold : 0;
      return sum + unit * qty;
    }, 0);
  }, [selected, returnQty]);

  if (isLoading && !data) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Sales History"
        subtitle="Click a row to open the invoice — use Return items to process returns"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!settings) return;
              downloadSalesReportPdf(sales, currency, settings.businessName);
            }}
          >
            Export page PDF
          </Button>
        }
      />

      <Card className="mb-4 bg-white" padding="md">
        <Input
          placeholder="Search invoice #, customer, or payment status..."
          value={search}
          autoComplete="off"
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-surface-muted text-left text-[10px] font-semibold uppercase text-text-muted">
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Actions</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-text-muted">
                    {debouncedSearch ? 'No invoices match your search.' : 'No sales yet.'}
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b border-border/50 transition hover:bg-brand-50/60"
                    onClick={() => void openInvoice(s.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-brand-700">{s.saleNumber}</p>
                      {s.hasReturns && (
                        <Badge variant="brand" className="mt-1">
                          Adjusted
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.customer?.name ?? 'Walk-in'}</p>
                      {s.customer?.phone && (
                        <p className="text-[10px] text-text-muted">{s.customer.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{s.cashier?.fullName ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{s.itemCount ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={paymentBadgeVariant(s.paymentStatus)}>{paymentLabel(s)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-brand-700">
                      {s.hasReturns && s.netTotal
                        ? formatMoney(s.netTotal, currency)
                        : formatMoney(s.grandTotal, currency)}
                      {s.hasReturns && (
                        <p className="text-[10px] font-normal text-text-muted line-through">
                          {formatMoney(s.grandTotal, currency)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => void openInvoice(s.id)}>
                          View
                        </Button>
                        {canReturn && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void openInvoice(s.id, 'return')}
                          >
                            Return
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {meta && (
          <div className={`border-t border-border px-4 py-3 ${isFetching ? 'opacity-70' : ''}`}>
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              pageSize={meta.pageSize}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      <Modal
        open={!!selected || loadingDetail}
        onClose={closeInvoice}
        title={
          selected
            ? panel === 'return'
              ? `Return — ${selected.saleNumber}`
              : panel === 'void'
                ? `Void — ${selected.saleNumber}`
                : `Invoice ${selected.saleNumber}`
            : 'Invoice'
        }
        size="xl"
        footer={
          selected ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {panel !== 'receipt' && (
                  <Button variant="ghost" onClick={() => setPanel('receipt')}>
                    Back to invoice
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {panel === 'receipt' && (
                  <>
                    <Button variant="ghost" onClick={closeInvoice}>
                      Close
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => downloadSaleInvoicePdf(selected, currency)}
                    >
                      Download PDF
                    </Button>
                    {canPrint && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (!settings) return;
                          void printSaleReceipt(selected, settings, currency);
                        }}
                      >
                        Reprint
                      </Button>
                    )}
                    {canReturnSelected && (
                      <Button
                        variant="accent"
                        onClick={() => {
                          setPanel('return');
                          window.setTimeout(() => returnPanelRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                        }}
                      >
                        Return items
                      </Button>
                    )}
                    {canVoid && selected.status === 'COMPLETED' && (
                      <Button variant="danger" onClick={() => setPanel('void')}>
                        Void sale
                      </Button>
                    )}
                  </>
                )}
                {panel === 'return' && (
                  <>
                    <Button variant="ghost" onClick={() => setPanel('receipt')}>
                      Cancel
                    </Button>
                    <Button
                      disabled={!returnReason.trim() || !Object.values(returnQty).some((q) => q > 0)}
                      onClick={() => setConfirmReturn(true)}
                    >
                      Process return
                      {estimatedRefund > 0 ? ` · ${formatMoney(estimatedRefund, currency)}` : ''}
                    </Button>
                  </>
                )}
                {panel === 'void' && (
                  <>
                    <Button variant="ghost" onClick={() => setPanel('receipt')}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!voidReason.trim()}
                      onClick={() => setConfirmVoid(true)}
                    >
                      Confirm void
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {loadingDetail || !selected ? (
          <PageLoader />
        ) : panel === 'return' ? (
          <div ref={returnPanelRef} className="space-y-4">
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
              <p className="font-semibold text-brand-900">Return items from this invoice</p>
              <p className="mt-1 text-sm text-brand-800/80">
                Enter qty to return for each line, add a reason, then process. Stock is restored for tracked
                products. The original receipt becomes adjusted.
              </p>
            </div>

            {selected.returns.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-sm">
                <p className="mb-2 font-medium">Already returned on this bill</p>
                {selected.returns.map((ret) => (
                  <p key={ret.id} className="text-xs text-text-muted">
                    {ret.returnNumber}: {formatMoney(ret.totalAmount, currency)} — {ret.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {selected.items.map((item) => {
                const sold = parseFloat(item.quantity);
                const returned = parseFloat(item.returnedQuantity ?? '0');
                const returnable = parseFloat(item.returnableQuantity ?? String(Math.max(0, sold - returned)));
                const unitRefund = sold > 0 ? parseFloat(item.lineTotal) / sold : 0;
                const qty = returnQty[item.id] ?? 0;

                if (returnable <= 0) {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/30 px-4 py-3 text-sm opacity-60"
                    >
                      <span>{item.productName}</span>
                      <Badge variant="default">Fully returned</Badge>
                    </div>
                  );
                }

                return (
                  <div key={item.id} className="rounded-xl border border-border bg-white px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-text">{item.productName}</p>
                        <p className="mt-1 text-xs text-text-muted">
                          Sold {sold}
                          {returned > 0 ? ` · Already returned ${returned}` : ''} · Can return {returnable} ·{' '}
                          {formatMoney(unitRefund, currency)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Return qty</span>
                        <Input
                          type="number"
                          min={0}
                          max={returnable}
                          step="1"
                          className="w-24"
                          placeholder="0"
                          value={returnQty[item.id] ?? ''}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setReturnQty({
                              ...returnQty,
                              [item.id]: Number.isFinite(next)
                                ? Math.min(Math.max(0, next), returnable)
                                : 0,
                            });
                          }}
                        />
                      </div>
                    </div>
                    {qty > 0 && (
                      <p className="mt-2 text-right text-sm font-semibold text-brand-800">
                        Line refund ≈ {formatMoney(unitRefund * qty, currency)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <Input
              label="Return reason (required)"
              placeholder="e.g. Customer returned damaged item"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />

            {estimatedRefund > 0 && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-right">
                <p className="text-xs text-emerald-800">Estimated refund</p>
                <p className="text-2xl font-black text-emerald-900">
                  {formatMoney(estimatedRefund, currency)}
                </p>
              </div>
            )}
          </div>
        ) : panel === 'void' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="font-semibold text-rose-900">Void entire sale</p>
              <p className="mt-1 text-sm text-rose-800">
                Cancels the whole bill ({formatMoney(selected.grandTotal, currency)}), restores stock, and
                reverses udhaar if any. Prefer Return items if only some products came back.
              </p>
            </div>
            <Input
              label="Void reason (required)"
              placeholder="Why is this sale being voided?"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {canReturnSelected && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3">
                <p className="text-sm text-brand-900">
                  Need to take items back? Use <strong>Return items</strong>.
                </p>
                <Button size="sm" variant="accent" onClick={() => setPanel('return')}>
                  Return items
                </Button>
              </div>
            )}
            {selected.returns.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm">
                <p className="font-semibold text-text">Adjusted invoice</p>
                <p className="mt-1 text-text-muted">
                  Original total {formatMoney(selected.grandTotal, currency)} is superseded. Receipt below shows
                  returns and net total.
                </p>
              </div>
            )}
            <ReceiptView sale={selected} currency={currency} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        onConfirm={() => voidSale.mutate()}
        title="Void entire sale?"
        message={
          selected ? (
            <>
              Void sale <strong className="text-text">{selected.saleNumber}</strong> for{' '}
              {formatMoney(selected.grandTotal, currency)}? Stock will be restored and udhaar entries
              reversed. Reason: {voidReason}
            </>
          ) : null
        }
        confirmLabel="Void sale"
        loading={voidSale.isPending}
      />

      <ConfirmDialog
        open={confirmReturn}
        onClose={() => setConfirmReturn(false)}
        onConfirm={() => partialReturn.mutate()}
        title="Process return?"
        message={
          <>
            Refund about <strong className="text-text">{formatMoney(estimatedRefund, currency)}</strong>.
            Selected quantities will return to stock (if tracked). This cannot be undone.
          </>
        }
        confirmLabel="Process return"
        loading={partialReturn.isPending}
      />
    </div>
  );
}
