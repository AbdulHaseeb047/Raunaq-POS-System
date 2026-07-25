import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api-client';
import {
  INVENTORY_CSV_HEADERS,
  csvRowsToImportProducts,
  downloadCsv,
  parseCsv,
  productToCsvRow,
} from '@/lib/csv-utils';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { filterAndRankProducts } from '@/lib/sale-utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { Product } from '@/types/api';

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [stockStatus, setStockStatus] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'stock' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: '',
    sellPrice: '',
    costPrice: '',
    barcode: '',
    sku: '',
    unit: 'pcs',
    categoryId: '',
    brandId: '',
    supplierId: '',
    expiryDate: '',
    trackStock: true,
    lowStockThreshold: '',
  });
  const [stockDelta, setStockDelta] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ count: number; errors: string[] } | null>(null);
  const [importRows, setImportRows] = useState<ReturnType<typeof csvRowsToImportProducts>['products']>([]);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = hasFeature(user, FEATURES.INVENTORY_EDIT);
  const canAdjust = hasFeature(user, FEATURES.INVENTORY_STOCK_ADJUST);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data: summary } = useQuery({ queryKey: ['inventory-summary'], queryFn: () => api.products.summary() });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
  const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => api.brands.list() });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.suppliers.list() });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', debouncedSearch, stockStatus, categoryFilter],
    queryFn: () =>
      api.products.list({
        search: debouncedSearch || undefined,
        stockStatus: stockStatus === 'all' ? undefined : stockStatus,
        categoryId: categoryFilter || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  // Filter + rank by live keyword: starts-with first, then contains.
  const displayedProducts = useMemo(() => {
    const rows = data?.data ?? [];
    const q = search.trim();
    if (!q) return rows;
    return filterAndRankProducts(rows, q);
  }, [data?.data, search]);

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const saveProduct = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        sellPrice: parseFloat(form.sellPrice),
        costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
        barcode: form.barcode || null,
        sku: form.sku || null,
        unit: form.unit,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        supplierId: form.supplierId || null,
        expiryDate: form.expiryDate || null,
        trackStock: form.trackStock,
        lowStockThreshold: form.lowStockThreshold ? parseFloat(form.lowStockThreshold) : null,
      };
      return modal === 'edit' && selected
        ? api.products.update(selected.id, body)
        : api.products.create(body);
    },
    onSuccess: () => {
      setModal(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const adjustStock = useMutation({
    mutationFn: () =>
      api.products.adjustStock(selected!.id, {
        quantityDelta: parseFloat(stockDelta),
        movementType: 'ADJUSTMENT',
      }),
    onSuccess: () => {
      setModal(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const importProducts = useMutation({
    mutationFn: () => api.products.importCsv({ rows: importRows, updateExisting: true }),
    onSuccess: (result) => {
      setImportResult(
        `Imported ${result.created} new, updated ${result.updated}, skipped ${result.skipped}.` +
          (result.errors.length > 0 ? ` ${result.errors.length} row(s) had errors.` : ''),
      );
      setImportRows([]);
      setImportPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
    },
  });

  const purgeAll = useMutation({
    mutationFn: () => api.products.purgeAll(),
    onSuccess: (result) => {
      setPurgeOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      setImportResult(`Removed ${result.deleted} product(s) from inventory.`);
    },
  });

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.products.list({ pageSize: 5000 });
      const rows = [
        [...INVENTORY_CSV_HEADERS],
        ...all.data.map((p) => productToCsvRow(p)),
      ];
      downloadCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } finally {
      setExporting(false);
    }
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    const { products, errors } = csvRowsToImportProducts(parsed);
    setImportRows(products);
    setImportPreview({ count: products.length, errors });
    setImportResult(null);
    setImportOpen(true);
  };

  const downloadTemplate = () => {
    downloadCsv('inventory-template.csv', [
      [...INVENTORY_CSV_HEADERS],
      ['Sample Product', 'SKU001', '8901234567890', '500', '350', 'pcs', 'General', '', '', '100', '10', 'true', ''],
    ]);
  };

  const openCreate = () => {
    setForm({ name: '', sellPrice: '', costPrice: '', barcode: '', sku: '', unit: 'pcs', categoryId: '', brandId: '', supplierId: '', expiryDate: '', trackStock: true, lowStockThreshold: '' });
    setSelected(null);
    setModal('create');
  };

  const openEdit = (p: Product) => {
    setSelected(p);
    setForm({
      name: p.name,
      sellPrice: p.sellPrice,
      costPrice: p.costPrice ?? '',
      barcode: p.barcode ?? '',
      sku: p.sku ?? '',
      unit: p.unit,
      categoryId: p.category?.id ?? '',
      brandId: p.brand?.id ?? '',
      supplierId: p.supplier?.id ?? '',
      expiryDate: p.expiryDate ?? '',
      trackStock: p.trackStock,
      lowStockThreshold: p.lowStockThreshold ?? '',
    });
    setModal('edit');
  };

  const currency = settings?.currency ?? 'PKR';

  if (isLoading && !data) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`${data?.meta.total ?? 0} products · Value ${formatMoney(summary?.inventoryValue ?? '0', currency)}`}
        action={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={exporting} onClick={() => void handleExportCsv()}>
                Export CSV
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Import CSV
              </Button>
              <Button onClick={openCreate}>Add product</Button>
            </div>
          ) : undefined
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleCsvFile(file);
          e.target.value = '';
        }}
      />

      {importResult && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {importResult}
          <button type="button" className="ml-2 underline" onClick={() => setImportResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-surface p-3 text-sm"><p className="text-text-muted">Healthy</p><p className="text-lg font-bold">{summary.healthyCount}</p></div>
          <div className="rounded-xl border bg-slate-50 p-3 text-sm"><p className="text-text-muted">Low stock</p><p className="text-lg font-bold text-slate-800">{summary.lowStockCount}</p></div>
          <div className="rounded-xl border bg-rose-50 p-3 text-sm"><p className="text-text-muted">Out of stock</p><p className="text-lg font-bold text-rose-800">{summary.outOfStockCount}</p></div>
          <div className="rounded-xl border bg-brand-50 p-3 text-sm"><p className="text-text-muted">Projected profit</p><p className="text-lg font-bold text-brand-800">{formatMoney(summary.projectedProfit, currency)}</p></div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="flex-1 min-w-[200px]"
          placeholder="Search name, SKU, or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        <select className="rounded-xl border border-border px-3 py-2 text-sm" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
          <option value="all">All stock</option>
          <option value="healthy">Healthy</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="rounded-xl border border-border px-3 py-2 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {displayedProducts.length === 0 ? (
        <EmptyState
          title="No products"
          description={search.trim() ? 'No products match your search.' : 'Add your first product to get started.'}
        />
      ) : (
        <div className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)] ${isFetching ? 'opacity-70' : ''}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayedProducts.map((p) => (
                <tr key={p.id} className="border-b border-border/60 hover:bg-brand-50/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{p.name}</p>
                    <p className="text-xs text-text-muted">{p.barcode || p.sku || '—'}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(p.sellPrice, currency)}</td>
                  <td className="px-4 py-3">
                    {p.trackStock ? (
                      <span
                        className={
                          p.lowStockThreshold &&
                          parseFloat(p.stockQuantity) <= parseFloat(p.lowStockThreshold)
                            ? 'text-warning font-semibold'
                            : ''
                        }
                      >
                        {p.stockQuantity}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.isActive ? 'success' : 'default'}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleteTarget(p)}>Delete</Button>
                      </>
                    )}
                    {canAdjust && p.trackStock && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelected(p);
                          setStockDelta('');
                          setModal('stock');
                        }}
                      >
                        Stock
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Edit product' : 'New product'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button loading={saveProduct.isPending} onClick={() => saveProduct.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Sell price" type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
          <Input label="Cost price" type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          <Input label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input label="Expiry date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          <select className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">No category</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
            <option value="">No brand</option>
            {(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">No supplier</option>
            {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Input label="Low stock threshold" type="number" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={modal === 'stock'}
        onClose={() => setModal(null)}
        title={`Adjust stock — ${selected?.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={adjustStock.isPending} onClick={() => adjustStock.mutate()}>Apply</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-text-muted">Current: {selected?.stockQuantity}</p>
        <Input
          label="Quantity change (+/-)"
          type="number"
          value={stockDelta}
          onChange={(e) => setStockDelta(e.target.value)}
        />
      </Modal>

      {canEdit && (data?.meta.total ?? 0) > 0 && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <p className="text-sm font-semibold text-rose-900">Danger zone</p>
          <p className="mt-1 text-xs text-rose-800">
            Remove all products from inventory. Sales history is kept. Export CSV first if you need a backup.
          </p>
          <Button className="mt-3" variant="danger" size="sm" onClick={() => setPurgeOpen(true)}>
            Clear all inventory
          </Button>
        </div>
      )}

      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportPreview(null);
          setImportRows([]);
        }}
        title="Import inventory from CSV"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={downloadTemplate}>
              Download template
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setImportOpen(false);
                setImportPreview(null);
                setImportRows([]);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={importProducts.isPending}
              disabled={!importPreview || importPreview.count === 0}
              onClick={() => importProducts.mutate()}
            >
              Import {importPreview?.count ?? 0} product(s)
            </Button>
          </>
        }
      >
        {importPreview ? (
          <div className="space-y-3 text-sm">
            <p>
              Ready to import <strong>{importPreview.count}</strong> product row(s). Existing products
              match by SKU or barcode and will be updated.
            </p>
            {importPreview.errors.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                <p className="font-medium">Parse warnings ({importPreview.errors.length})</p>
                <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-xs">
                  {importPreview.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-text-muted">
              Columns: name, sku, barcode, sell_price, cost_price, unit, category, brand, supplier,
              stock_quantity, low_stock_threshold, track_stock, expiry_date
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Select a CSV file to preview import.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        onConfirm={() => purgeAll.mutate()}
        title="Clear all inventory?"
        message="This removes every product from your shop database. Sales records are not deleted. Export CSV first if you need a backup."
        confirmLabel="Clear all products"
        loading={purgeAll.isPending}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteProduct.mutate(deleteTarget.id);
        }}
        title="Delete product"
        message={
          deleteTarget ? (
            <>
              Delete <strong className="text-text">{deleteTarget.name}</strong>? It will be removed from
              inventory and sales search. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete product"
        loading={deleteProduct.isPending}
      />
    </div>
  );
}
