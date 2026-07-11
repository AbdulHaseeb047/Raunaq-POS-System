import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { ReceiptView } from '@/components/billing/ReceiptView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api-client';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { printSaleReceipt } from '@/lib/print-receipt';
import { downloadSaleInvoicePdf, downloadSalesReportPdf } from '@/lib/sales-pdf';
import type { SaleDetail } from '@/types/api';

export function SalesHistoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [search, setSearch] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);

  const canVoid = hasFeature(user, FEATURES.BILLING_VOID_SALE);
  const canPrint = hasFeature(user, FEATURES.BILLING_PRINT_RECEIPT);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
  const { data, isLoading } = useQuery({ queryKey: ['sales'], queryFn: () => api.sales.list(1, 50) });

  const loadDetail = async (saleId: string) => {
    setSelected(await api.sales.get(saleId));
  };

  const voidSale = useMutation({
    mutationFn: () => api.sales.void(selected!.id, voidReason),
    onSuccess: () => {
      setSelected(null);
      setVoidReason('');
      setConfirmVoid(false);
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
      if (selected) await loadDetail(selected.id);
      setReturnQty({});
      setReturnReason('');
      setConfirmReturn(false);
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const currency = settings?.currency ?? 'PKR';
  const sales = data?.data ?? [];
  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sales;
    return sales.filter((s) => {
      const haystack = [
        s.saleNumber,
        s.paymentStatus,
        s.customer?.name ?? 'walk-in',
        s.grandTotal,
        new Date(s.createdAt).toLocaleString(),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [sales, search]);

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Sales History"
        subtitle="Receipts, voids, and returns"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!settings) return;
              downloadSalesReportPdf(sales, currency, settings.businessName);
            }}
          >
            Export sales PDF
          </Button>
        }
      />
      <Card className="mb-4 bg-white" padding="md">
        <Input
          placeholder="Search bill number, customer, amount, or payment status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          {filteredSales.map((s) => (
            <button key={s.id} type="button" onClick={() => void loadDetail(s.id)} className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-brand-300">
              <div>
                <p className="font-semibold">{s.saleNumber}</p>
                <p className="text-xs text-text-muted">
                  {new Date(s.createdAt).toLocaleString()} · {s.customer?.name ?? 'Walk-in'} · {s.paymentStatus}
                </p>
              </div>
              <span className="font-bold text-brand-700">{formatMoney(s.grandTotal, currency)}</span>
            </button>
          ))}
          {filteredSales.length === 0 && (
            <Card className="text-center text-sm text-text-muted" padding="md">
              No bills match your search.
            </Card>
          )}
        </div>

        {selected && (
          <div className="space-y-4">
            <ReceiptView sale={selected} currency={currency} />
            <div className="flex flex-wrap gap-2">
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
              Reprint receipt
            </Button>
            )}
            </div>

            {canVoid && selected.status === 'COMPLETED' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="font-semibold text-rose-900">Void entire sale</p>
                <Input className="mt-2" placeholder="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                <Button className="mt-2" variant="danger" disabled={!voidReason} onClick={() => setConfirmVoid(true)}>Void sale</Button>
              </div>
            )}

            {canVoid && selected.status === 'COMPLETED' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold">Partial return</p>
                {selected.items.map((item) => (
                  <div key={item.id} className="mt-2 flex items-center gap-2 text-sm">
                    <span className="flex-1">{item.productName}</span>
                    <Input type="number" min={0} max={parseFloat(item.quantity)} className="w-20" value={returnQty[item.id] ?? ''} onChange={(e) => setReturnQty({ ...returnQty, [item.id]: Number(e.target.value) })} />
                  </div>
                ))}
                <Input className="mt-2" placeholder="Return reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
                <Button className="mt-2" disabled={!returnReason || !Object.values(returnQty).some((q) => q > 0)} onClick={() => setConfirmReturn(true)}>Process return</Button>
              </div>
            )}
          </div>
        )}
      </div>

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
        title="Process partial return?"
        message="Selected items will be returned to stock and the sale total adjusted. This cannot be undone."
        confirmLabel="Process return"
        loading={partialReturn.isPending}
      />
    </div>
  );
}
