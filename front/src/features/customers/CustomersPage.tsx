import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { ReceiptView } from '@/components/billing/ReceiptView';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { GrowingChart } from '@/components/ui/GrowingChart';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api-client';
import { useDateRangeFilter } from '@/lib/date-range';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney, isTimestampInLocalDateRange, localDateIso } from '@/lib/format';
import { buildCustomerStatementHtml, openPrintDocument } from '@/lib/print-document';
import { printSaleReceipt } from '@/lib/print-receipt';
import { customerMatchesSearch } from '@/lib/search-match';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { Customer, LedgerEntry, SaleDetail, UdhaarAgingRow } from '@/types/api';

const CUSTOMER_PAGE_SIZE = 20;

function shortDay(isoDate: string) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

function printStatement(
  customer: Customer,
  ledger: Array<{
    entryType: string;
    amount: string;
    balanceAfter: string;
    createdAt: string;
    description?: string;
  }>,
  currency: string,
  businessName: string,
) {
  openPrintDocument(
    `Statement - ${customer.name}`,
    buildCustomerStatementHtml(customer, ledger, currency, businessName),
  );
}

export function CustomersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [sortByBalance, setSortByBalance] = useState(true);
  const { range, setRange, customFrom, setCustomFrom, customTo, setCustomTo, dates } =
    useDateRangeFilter('month');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [modal, setModal] = useState<'create' | 'edit' | 'payment' | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', creditLimit: '', address: '' });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [voidEntryId, setVoidEntryId] = useState<string | null>(null);
  const [receiptSale, setReceiptSale] = useState<SaleDetail | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const canEdit = hasFeature(user, FEATURES.CUSTOMERS_EDIT);
  const canLedger = hasFeature(user, FEATURES.CUSTOMERS_LEDGER_VIEW);
  const canPay = hasFeature(user, FEATURES.CUSTOMERS_LEDGER_RECORD);
  const canVoid = hasFeature(user, FEATURES.CUSTOMERS_LEDGER_EDIT);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers', debouncedSearch, sortByBalance, page],
    queryFn: () =>
      api.customers.list(
        debouncedSearch || undefined,
        page,
        CUSTOMER_PAGE_SIZE,
        sortByBalance ? 'balance' : 'name',
      ),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortByBalance]);

  const visibleCustomers = useMemo(() => {
    const rows = data?.data ?? [];
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((c) => customerMatchesSearch(c, q));
  }, [data?.data, search]);

  const { data: aging } = useQuery({
    queryKey: ['reports', 'aging'],
    queryFn: () => api.reports.udhaarAging(),
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['ledger', selected?.id],
    queryFn: () => api.customers.ledger(selected!.id),
    enabled: !!selected && canLedger,
  });

  const agingByCustomer = useMemo(() => {
    const map = new Map<string, UdhaarAgingRow>();
    for (const row of aging ?? []) {
      map.set(row.customerId, row);
    }
    return map;
  }, [aging]);

  const overdueMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of aging ?? []) {
      if (parseFloat(row.bucket30_plus) > 0) map.set(row.customerId, row.bucket30_plus);
    }
    return map;
  }, [aging]);

  const customerAging = useMemo(
    () => (selected ? (agingByCustomer.get(selected.id) ?? null) : null),
    [agingByCustomer, selected],
  );

  const cashflowSeries = useMemo(() => {
    if (!ledger?.length) return [];
    const byDay = new Map<string, { out: number; inn: number }>();
    const sorted = [...ledger]
      .filter((e) => !e.voidedAt && e.entryType !== 'VOID_REVERSAL')
      .filter((e) => isTimestampInLocalDateRange(e.createdAt, dates.from, dates.to))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const e of sorted) {
      const day = localDateIso(new Date(e.createdAt));
      const bucket = byDay.get(day) ?? { out: 0, inn: 0 };
      const amt = Math.abs(parseFloat(e.amount) || 0);
      if (e.entryType === 'PAYMENT' || parseFloat(e.amount) < 0) bucket.inn += amt;
      else bucket.out += amt;
      byDay.set(day, bucket);
    }
    return [...byDay.entries()].map(([iso, v]) => ({
      label: shortDay(iso),
      value: v.out,
      secondary: v.inn,
    }));
  }, [ledger, dates.from, dates.to]);

  const cashflowTotals = useMemo(() => {
    let out = 0;
    let inn = 0;
    for (const p of cashflowSeries) {
      out += p.value;
      inn += p.secondary;
    }
    return { out, inn };
  }, [cashflowSeries]);

  const filteredLedger = useMemo(() => {
    if (!ledger?.length) return [];
    return ledger.filter(
      (e) =>
        !e.voidedAt &&
        e.entryType !== 'VOID_REVERSAL' &&
        isTimestampInLocalDateRange(e.createdAt, dates.from, dates.to),
    );
  }, [ledger, dates.from, dates.to]);

  const saveCustomer = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        phone: form.phone || null,
        address: form.address || null,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
      };
      return modal === 'edit' && selected
        ? api.customers.update(selected.id, body)
        : api.customers.create(body);
    },
    onSuccess: (c) => {
      setModal(null);
      setSelected(c);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save customer');
    },
  });

  const recordPayment = useMutation({
    mutationFn: () =>
      api.customers.payment(selected!.id, {
        amount: parseFloat(paymentAmount),
        paymentMethod: 'cash',
      }),
    onSuccess: (c) => {
      setModal(null);
      setPaymentAmount('');
      setSelected(c);
      void queryClient.invalidateQueries({ queryKey: ['ledger', c.id] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'aging'] });
    },
  });

  const voidEntry = useMutation({
    mutationFn: () => api.customers.voidLedger(selected!.id, voidEntryId!, voidReason),
    onSuccess: () => {
      setVoidEntryId(null);
      setVoidReason('');
      void queryClient.invalidateQueries({ queryKey: ['ledger', selected?.id] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const removeCustomer = useMutation({
    mutationFn: (id: string) => api.customers.delete(id),
    onSuccess: (_, id) => {
      if (selected?.id === id) setSelected(null);
      setDeleteTarget(null);
      setDeleteError('');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'aging'] });
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete customer');
    },
  });

  const currency = settings?.currency ?? 'PKR';

  const openLedgerReceipt = async (entry: LedgerEntry) => {
    if (!entry.saleId) return;
    setLoadingReceipt(true);
    try {
      setReceiptSale(await api.sales.get(entry.saleId));
    } finally {
      setLoadingReceipt(false);
    }
  };

  if (isLoading && !data) return <PageLoader />;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className={`lg:col-span-2 ${selected ? 'hidden lg:block' : ''}`}>
        <PageHeader
          title="Udhaar accounts"
          subtitle="All customers — use the date filter to focus ledger activity"
          action={
            canEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  setForm({ name: '', phone: '', creditLimit: '', address: '' });
                  setModal('create');
                }}
              >
                Add customer
              </Button>
            ) : undefined
          }
        />
        <DateRangeFilter
          range={range}
          onRangeChange={setRange}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          from={dates.from}
          to={dates.to}
        />
        <div className="mb-3 flex gap-2">
          <Input
            className="flex-1"
            placeholder="Search name or phone..."
            value={search}
            autoComplete="off"
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={() => setSortByBalance((v) => !v)}>
            {sortByBalance ? 'By balance' : 'By name'}
          </Button>
        </div>
        <div
          className={`max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto ${isFetching ? 'opacity-70' : ''}`}
        >
          {(visibleCustomers ?? []).map((c) => {
            const overdue = overdueMap.get(c.id);
            const rowAging = agingByCustomer.get(c.id);
            const hasAging = rowAging && parseFloat(rowAging.total) > 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  selected?.id === c.id
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-border bg-surface hover:border-brand-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-text">{c.name}</p>
                    {c.phone && <p className="text-xs text-text-muted">{c.phone}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {parseFloat(c.balance) > 0 && (
                      <Badge variant="warning">{formatMoney(c.balance, currency)}</Badge>
                    )}
                    {overdue && (
                      <Badge variant="danger">Overdue {formatMoney(overdue, currency)}</Badge>
                    )}
                  </div>
                </div>
                {hasAging ? (
                  <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-surface-muted/80 px-2 py-2 text-[11px]">
                    <div>
                      <p className="text-text-muted">0–7d</p>
                      <p className="font-semibold text-text">
                        {formatMoney(rowAging.bucket0_7, currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted">8–30d</p>
                      <p className="font-semibold text-text">
                        {formatMoney(rowAging.bucket8_30, currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted">30+d</p>
                      <p className="font-semibold text-danger">
                        {formatMoney(rowAging.bucket30_plus, currency)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </button>
            );
          })}
          {visibleCustomers.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
              {search.trim() ? 'No customers match your search.' : 'No customers yet.'}
            </p>
          )}
        </div>
        {data?.meta ? (
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            pageSize={data.meta.pageSize}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <div className={`lg:col-span-3 ${!selected ? 'hidden lg:block' : ''}`}>
        {!selected ? (
          <Card className="flex h-64 items-center justify-center text-text-muted">
            Select a customer to view ledger statement
          </Card>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mb-3 lg:hidden"
              onClick={() => setSelected(null)}
            >
              ← Back to customers
            </Button>
            <Card className="mb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-text">{selected.name}</h2>
                  <p className="text-sm text-text-muted">{selected.phone || 'No phone'}</p>
                  {selected.creditLimit && (
                    <p className="mt-1 text-xs text-text-muted">
                      Credit limit: {formatMoney(selected.creditLimit, currency)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-muted">Outstanding</p>
                  <p className="text-3xl font-black text-brand-700">
                    {formatMoney(selected.balance, currency)}
                  </p>
                </div>
              </div>

              {customerAging && parseFloat(customerAging.total) > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-muted p-3 text-sm">
                  <div>
                    <p className="text-xs text-text-muted">0–7 days</p>
                    <p className="font-semibold">
                      {formatMoney(customerAging.bucket0_7, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">8–30 days</p>
                    <p className="font-semibold">
                      {formatMoney(customerAging.bucket8_30, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">30+ days</p>
                    <p className="font-semibold text-danger">
                      {formatMoney(customerAging.bucket30_plus, currency)}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {canEdit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setForm({
                        name: selected.name,
                        phone: selected.phone ?? '',
                        creditLimit: selected.creditLimit ?? '',
                        address: selected.address ?? '',
                      });
                      setModal('edit');
                    }}
                  >
                    Edit / limit
                  </Button>
                )}
                {canPay && parseFloat(selected.balance) > 0 && (
                  <Button size="sm" onClick={() => setModal('payment')}>
                    Record payment
                  </Button>
                )}
                {canLedger && filteredLedger.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      printStatement(
                        selected,
                        filteredLedger,
                        currency,
                        settings?.businessName ?? 'Statement',
                      )
                    }
                  >
                    Print statement
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setDeleteError('');
                      setDeleteTarget(selected);
                    }}
                  >
                    Delete customer
                  </Button>
                )}
              </div>
            </Card>

            {canLedger && (
              <div className="mb-4">
                {ledgerLoading ? (
                  <Card className="flex h-48 items-center justify-center text-sm text-text-muted">
                    Loading cashflow…
                  </Card>
                ) : (
                  <GrowingChart
                    title="Money in & out"
                    subtitle={`${formatMoney(cashflowTotals.out, currency)} charged · ${formatMoney(cashflowTotals.inn, currency)} received`}
                    data={cashflowSeries}
                    color="#be123c"
                    secondaryColor="#059669"
                    primaryLabel="Udhaar charged"
                    secondaryLabel="Payments received"
                    formatValue={(n) => formatMoney(n, currency)}
                    cumulative
                    height={200}
                  />
                )}
              </div>
            )}

            {canLedger && (
              <Card>
                <CardHeader
                  title="Trade history"
                  subtitle={`Entries from ${dates.from === dates.to ? dates.from : `${dates.from} → ${dates.to}`}`}
                />
                {ledgerLoading ? (
                  <PageLoader />
                ) : filteredLedger.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-text-muted">
                    No udhaar activity in this date range.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="bg-surface-muted text-left text-[10px] font-semibold uppercase text-text-muted">
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3">Due / Age</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right">Balance</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                            <th className="px-4 py-3">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLedger.map((e) => (
                            <tr
                              key={e.id}
                              className={`border-t border-border/60 ${e.saleId ? 'cursor-pointer hover:bg-brand-50/50' : ''} ${e.voidedAt ? 'opacity-50' : ''}`}
                              onClick={() => e.saleId && void openLedgerReceipt(e)}
                            >
                              <td className="px-4 py-3">
                                <p className="font-medium">{e.description}</p>
                                {e.saleNumber && (
                                  <p className="text-[10px] text-text-muted">Bill {e.saleNumber}</p>
                                )}
                                {e.recordedBy && (
                                  <p className="text-[10px] text-text-muted">
                                    By {e.recordedBy.fullName}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-text-muted">
                                {e.dueDate && <p>Since {formatDate(e.dueDate)}</p>}
                                {e.daysOutstanding != null && e.daysOutstanding > 0 && (
                                  <Badge variant={e.daysOutstanding > 30 ? 'danger' : 'warning'}>
                                    {e.daysOutstanding}d outstanding
                                  </Badge>
                                )}
                                {e.remainingAmount && parseFloat(e.remainingAmount) > 0 && (
                                  <p className="mt-1">
                                    Due {formatMoney(e.remainingAmount, currency)}
                                  </p>
                                )}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-semibold ${parseFloat(e.amount) < 0 ? 'text-brand-700' : ''}`}
                              >
                                {formatMoney(e.amount, currency)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {formatMoney(e.balanceAfter, currency)}
                              </td>
                              <td
                                className="px-4 py-3 text-right"
                                onClick={(ev) => ev.stopPropagation()}
                              >
                                {e.saleId && (
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-brand-700 hover:underline"
                                    onClick={() => void openLedgerReceipt(e)}
                                  >
                                    Receipt
                                  </button>
                                )}
                                {canVoid && e.entryType === 'PAYMENT' && !e.voidedAt && (
                                  <button
                                    type="button"
                                    className="ml-2 text-xs text-danger hover:underline"
                                    onClick={() => setVoidEntryId(e.id)}
                                  >
                                    Void
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                                {formatDate(e.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>

      <Modal
        open={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Edit customer' : 'New customer'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button loading={saveCustomer.isPending} onClick={() => saveCustomer.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Credit limit"
            type="number"
            value={form.creditLimit}
            onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        open={modal === 'payment'}
        onClose={() => setModal(null)}
        title="Record payment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button loading={recordPayment.isPending} onClick={() => recordPayment.mutate()}>
              Record
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-text-muted">
          Partial payments auto-allocate FIFO to oldest udhaar first.
        </p>
        <Input
          label="Amount"
          type="number"
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
        />
      </Modal>

      <Modal
        open={!!receiptSale}
        onClose={() => setReceiptSale(null)}
        title={receiptSale ? `Receipt ${receiptSale.saleNumber}` : 'Receipt'}
        size="lg"
        footer={
          receiptSale ? (
            <>
              <Button variant="ghost" onClick={() => setReceiptSale(null)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!receiptSale || !settings) return;
                  void printSaleReceipt(receiptSale, settings, currency);
                }}
              >
                Print
              </Button>
            </>
          ) : undefined
        }
      >
        {loadingReceipt ? (
          <PageLoader />
        ) : receiptSale ? (
          <ReceiptView sale={receiptSale} currency={currency} />
        ) : null}
      </Modal>

      <Modal
        open={!!voidEntryId}
        onClose={() => setVoidEntryId(null)}
        title="Void payment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoidEntryId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={voidEntry.isPending}
              onClick={() => voidEntry.mutate()}
            >
              Void
            </Button>
          </>
        }
      >
        <Input label="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError('');
        }}
        onConfirm={() => {
          if (deleteTarget && parseFloat(deleteTarget.balance) <= 0) {
            removeCustomer.mutate(deleteTarget.id);
          }
        }}
        title="Delete customer"
        message={
          deleteTarget ? (
            parseFloat(deleteTarget.balance) > 0 ? (
              <>
                <strong className="text-text">{deleteTarget.name}</strong> still owes{' '}
                <strong className="text-text">{formatMoney(deleteTarget.balance, currency)}</strong>
                .
                <span className="mt-2 block text-danger">
                  You cannot delete this customer until the udhaar is fully repaid. Record a payment
                  first, then delete.
                </span>
              </>
            ) : (
              <>
                Delete <strong className="text-text">{deleteTarget.name}</strong>? Past sales stay
                in history; the customer is removed from udhaar accounts.
                {deleteError && <span className="mt-2 block text-danger">{deleteError}</span>}
              </>
            )
          ) : null
        }
        confirmLabel={
          deleteTarget && parseFloat(deleteTarget.balance) > 0 ? 'Cannot delete' : 'Delete customer'
        }
        confirmDisabled={!!deleteTarget && parseFloat(deleteTarget.balance) > 0}
        loading={removeCustomer.isPending}
      />
    </div>
  );
}
