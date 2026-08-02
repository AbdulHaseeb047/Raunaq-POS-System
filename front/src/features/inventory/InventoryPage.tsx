import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton, TableSkeleton } from '@/components/ui/PageSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/api-client';
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  INVENTORY_CSV_FIELD_META,
  INVENTORY_CSV_HEADERS,
  csvRowsToImportProducts,
  downloadCsv,
  parseCsvFileText,
  productToCsvRow,
  yieldToUi,
  type InventoryCsvColumnMapping,
  type InventoryCsvField,
  type InventoryCsvRow,
} from '@/lib/csv-utils';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { Product } from '@/types/api';

const PAGE_SIZE = 20;
const STOCK_FILTERS = new Set(['all', 'healthy', 'low', 'out']);

function parseStockParam(value: string | null): string {
  if (value && STOCK_FILTERS.has(value)) return value;
  return 'all';
}

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [stockStatus, setStockStatus] = useState(() => parseStockParam(searchParams.get('stock')));
  const [page, setPage] = useState(1);
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
  const [formErrorVisible, setFormErrorVisible] = useState(false);
  const [stockDelta, setStockDelta] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ count: number; errors: string[] } | null>(
    null,
  );
  const [importRows, setImportRows] = useState<InventoryCsvRow[]>([]);
  const [importRawRows, setImportRawRows] = useState<string[][] | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<InventoryCsvColumnMapping>({});
  const [importUnmatched, setImportUnmatched] = useState<string[]>([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importParseGen = useRef(0);
  const skipMapEffect = useRef(false);
  const debouncedImportMapping = useDebouncedValue(importMapping, 280);

  const canEdit = hasFeature(user, FEATURES.INVENTORY_EDIT);
  const canAdjust = hasFeature(user, FEATURES.INVENTORY_STOCK_ADJUST);

  useEffect(() => {
    const next = parseStockParam(searchParams.get('stock'));
    setStockStatus((prev) => (prev === next ? prev : next));
    setPage(1);
  }, [searchParams]);

  const applyStockStatus = (value: string) => {
    const next = parseStockParam(value);
    setStockStatus(next);
    setPage(1);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'all') params.delete('stock');
        else params.set('stock', next);
        return params;
      },
      { replace: true },
    );
  };

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });
  const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => api.brands.list() });
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.suppliers.list(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', 'inventory', debouncedSearch, stockStatus, categoryFilter, page],
    queryFn: () =>
      api.products.list({
        search: debouncedSearch.trim() || undefined,
        stockStatus: stockStatus === 'all' ? undefined : stockStatus,
        categoryId: categoryFilter.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 0,
    refetchOnMount: 'always',
    placeholderData: (prev) => prev,
  });

  // Heavy full-catalog aggregate — load after the product list paints.
  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api.products.summary(),
    enabled: Boolean(data),
    staleTime: 60_000,
  });

  const displayedProducts = data?.data ?? [];
  const meta = data?.meta;
  const listLoading = isLoading || (isFetching && !data);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter]);

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
      setImportRawRows(null);
      setImportHeaders([]);
      setImportMapping({});
      setImportUnmatched([]);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
    },
    onError: (err) => {
      setImportResult(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Import failed. Try a smaller file or check your connection.',
      );
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
      const rows = [[...INVENTORY_CSV_HEADERS], ...all.data.map((p) => productToCsvRow(p))];
      downloadCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } finally {
      setExporting(false);
    }
  };

  const resetImportState = () => {
    importParseGen.current += 1;
    setImportOpen(false);
    setImportPreview(null);
    setImportRows([]);
    setImportRawRows(null);
    setImportHeaders([]);
    setImportMapping({});
    setImportUnmatched([]);
    setImportParsing(false);
  };

  const applyImportMapping = (rows: string[][], mapping: InventoryCsvColumnMapping) => {
    const { products, errors, unmatchedHeaders, missingRequired, truncated } =
      csvRowsToImportProducts(rows, mapping);
    setImportRows(products);
    setImportUnmatched(unmatchedHeaders);
    const msgs = [...errors];
    if (missingRequired.length > 0) {
      msgs.unshift(`Map required fields first: ${missingRequired.join(', ')}.`);
    }
    if (truncated && !msgs.some((m) => m.includes('first'))) {
      msgs.unshift(`Only first ${CSV_IMPORT_MAX_ROWS} rows will be imported.`);
    }
    setImportPreview({ count: products.length, errors: msgs });
  };

  // Remap after user changes dropdowns — debounced so rapid clicks don't freeze UI.
  useEffect(() => {
    if (!importRawRows || !importOpen) return;
    if (skipMapEffect.current) {
      skipMapEffect.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      await yieldToUi();
      if (cancelled) return;
      applyImportMapping(importRawRows, debouncedImportMapping);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on debounced mapping
  }, [debouncedImportMapping, importRawRows, importOpen]);

  const handleCsvFile = async (file: File) => {
    const gen = ++importParseGen.current;
    setImportResult(null);
    setImportOpen(true);
    setImportParsing(true);
    setImportPreview(null);
    setImportRows([]);
    setImportRawRows(null);
    setImportHeaders([]);
    setImportMapping({});
    setImportUnmatched([]);

    try {
      if (file.size > CSV_IMPORT_MAX_BYTES) {
        if (importParseGen.current !== gen) return;
        setImportPreview({
          count: 0,
          errors: [
            `File is too large (${Math.ceil(file.size / (1024 * 1024))} MB). Max allowed is ${Math.floor(CSV_IMPORT_MAX_BYTES / (1024 * 1024))} MB. Split the CSV and import in parts.`,
          ],
        });
        return;
      }

      const text = await file.text();
      if (importParseGen.current !== gen) return;
      await yieldToUi();
      if (importParseGen.current !== gen) return;

      const parsed = await parseCsvFileText(text);
      if (importParseGen.current !== gen) return;

      if (parsed.length === 0) {
        setImportPreview({ count: 0, errors: ['CSV file is empty'] });
        return;
      }

      const headers = parsed[0]!.map((h) => h.trim());
      const result = csvRowsToImportProducts(parsed);
      if (importParseGen.current !== gen) return;

      skipMapEffect.current = true;
      setImportRawRows(parsed);
      setImportHeaders(headers);
      setImportMapping(result.mapping);
      setImportUnmatched(result.unmatchedHeaders);
      setImportRows(result.products);
      setImportPreview({
        count: result.products.length,
        errors:
          result.missingRequired.length > 0
            ? [
                `Could not auto-match: ${result.missingRequired.join(', ')}. Choose the correct CSV column for each field below.`,
                ...result.errors.filter((e) => !e.startsWith('Required columns')),
              ]
            : result.errors,
      });
    } catch {
      if (importParseGen.current !== gen) return;
      setImportPreview({
        count: 0,
        errors: ['Could not read this CSV. Save it as UTF-8 CSV and try again.'],
      });
    } finally {
      if (importParseGen.current === gen) setImportParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setFieldMapping = (field: InventoryCsvField, columnIndex: number) => {
    setImportMapping((prev) => {
      const next: InventoryCsvColumnMapping = { ...prev };
      if (columnIndex >= 0) {
        for (const key of Object.keys(next) as InventoryCsvField[]) {
          if (next[key] === columnIndex) delete next[key];
        }
        next[field] = columnIndex;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const downloadTemplate = () => {
    downloadCsv('inventory-template.csv', [
      [...INVENTORY_CSV_HEADERS],
      [
        'Sample Product',
        'SKU001',
        '8901234567890',
        '500',
        '350',
        'pcs',
        'General',
        '',
        '',
        '100',
        '10',
        'true',
        '',
      ],
    ]);
  };

  const columnSelectOptions = useMemo(() => {
    const opts = [{ value: '-1', label: '— Skip / not in file —' }];
    importHeaders.forEach((h, i) => {
      opts.push({ value: String(i), label: h || `(Column ${i + 1})` });
    });
    return opts;
  }, [importHeaders]);

  const requiredMapped = INVENTORY_CSV_FIELD_META.filter((f) => f.required).every(
    (f) => importMapping[f.field] != null && importMapping[f.field]! >= 0,
  );

  const openCreate = () => {
    setForm({
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
    setSelected(null);
    setFormErrorVisible(false);
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
    setFormErrorVisible(false);
    setModal('edit');
  };

  const currency = settings?.currency ?? 'PKR';

  const sellPriceNum = parseFloat(form.sellPrice);
  const costPriceNum = parseFloat(form.costPrice);
  const lowStockNum = parseFloat(form.lowStockThreshold);
  const productFormErrors = {
    name: !form.name.trim() ? 'Name is required' : '',
    sellPrice:
      form.sellPrice.trim() === '' || !Number.isFinite(sellPriceNum) || sellPriceNum < 0
        ? 'Sell price is required'
        : '',
    costPrice:
      form.costPrice.trim() === '' || !Number.isFinite(costPriceNum) || costPriceNum < 0
        ? 'Cost price is required'
        : '',
    lowStockThreshold:
      form.lowStockThreshold.trim() === '' || !Number.isFinite(lowStockNum) || lowStockNum < 0
        ? 'Low stock threshold is required'
        : '',
  };
  const canSaveProduct =
    !productFormErrors.name &&
    !productFormErrors.sellPrice &&
    !productFormErrors.costPrice &&
    !productFormErrors.lowStockThreshold;

  if (listLoading) return <PageSkeleton rows={8} />;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`${summary?.totalProducts ?? data?.meta.total ?? 0} products in system · Value ${formatMoney(summary?.inventoryValue ?? '0', currency)}`}
        action={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={exporting}
                onClick={() => void handleExportCsv()}
              >
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

      {isFetching && (
        <div className="mb-3" aria-busy="true" aria-label="Updating products">
          <TableSkeleton rows={3} />
        </div>
      )}
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
          <div className="rounded-xl border bg-surface p-3 text-sm">
            <p className="text-text-muted">Healthy</p>
            <p className="text-lg font-bold">{summary.healthyCount}</p>
          </div>
          <Link
            to="/inventory?stock=low"
            className="rounded-xl border bg-slate-50 p-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <p className="text-text-muted">Low stock</p>
            <p className="text-lg font-bold text-slate-800">{summary.lowStockCount}</p>
            <p className="mt-1 text-[11px] font-semibold text-brand-700">View all →</p>
          </Link>
          <Link
            to="/inventory?stock=out"
            className="rounded-xl border bg-rose-50 p-3 text-sm transition hover:border-rose-300 hover:bg-rose-100/60"
          >
            <p className="text-text-muted">Out of stock</p>
            <p className="text-lg font-bold text-rose-800">{summary.outOfStockCount}</p>
            <p className="mt-1 text-[11px] font-semibold text-rose-700">View all →</p>
          </Link>
          <div className="rounded-xl border bg-brand-50 p-3 text-sm">
            <p className="text-text-muted">Projected profit</p>
            <p className="text-lg font-bold text-brand-800">
              {formatMoney(summary.projectedProfit, currency)}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        <input
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:min-w-[200px]"
          placeholder="Search name, SKU, or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          inputMode="search"
          enterKeyHint="search"
        />
        <select
          className="min-h-[44px] w-full shrink-0 rounded-xl border border-border bg-white px-3 py-2 text-sm sm:w-auto sm:min-w-[140px]"
          value={stockStatus}
          onChange={(e) => applyStockStatus(e.target.value)}
        >
          <option value="all">All stock</option>
          <option value="healthy">Healthy</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select
          className="min-h-[44px] w-full shrink-0 rounded-xl border border-border bg-white px-3 py-2 text-sm sm:w-auto sm:min-w-[160px]"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {displayedProducts.length === 0 ? (
        <EmptyState
          title="No products"
          description={
            search.trim()
              ? 'No products match your search.'
              : 'Add your first product to get started.'
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className={`space-y-3 md:hidden ${isFetching ? 'opacity-70' : ''}`}>
            {displayedProducts.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">{p.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{p.barcode || p.sku || '—'}</p>
                  </div>
                  <Badge variant={p.isActive ? 'success' : 'default'}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <p>
                    <span className="text-text-muted">Price </span>
                    <span className="font-semibold">{formatMoney(p.sellPrice, currency)}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">Stock </span>
                    <span
                      className={
                        p.trackStock &&
                        p.lowStockThreshold &&
                        parseFloat(p.stockQuantity) <= parseFloat(p.lowStockThreshold)
                          ? 'font-semibold text-warning'
                          : 'font-semibold'
                      }
                    >
                      {p.trackStock ? p.stockQuantity : '—'}
                    </span>
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => setDeleteTarget(p)}
                      >
                        Delete
                      </Button>
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
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div
            className={`hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)] md:block ${isFetching ? 'opacity-70' : ''}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
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
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(p.sellPrice, currency)}
                      </td>
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
                            <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() => setDeleteTarget(p)}
                            >
                              Delete
                            </Button>
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
          </div>

          {meta ? (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              pageSize={meta.pageSize}
              onPageChange={setPage}
            />
          ) : null}
        </>
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
            <Button
              loading={saveProduct.isPending}
              onClick={() => {
                if (!canSaveProduct) {
                  setFormErrorVisible(true);
                  return;
                }
                saveProduct.mutate();
              }}
            >
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
            required
            error={formErrorVisible ? productFormErrors.name || undefined : undefined}
          />
          <Input
            label="Sell price"
            type="number"
            value={form.sellPrice}
            onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
            required
            error={formErrorVisible ? productFormErrors.sellPrice || undefined : undefined}
          />
          <Input
            label="Cost price"
            type="number"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            required
            error={formErrorVisible ? productFormErrors.costPrice || undefined : undefined}
          />
          <Input
            label="Barcode"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          />
          <Input
            label="SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
          <Input
            label="Expiry date"
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
          />
          <select
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">No category</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            value={form.brandId}
            onChange={(e) => setForm({ ...form, brandId: e.target.value })}
          >
            <option value="">No brand</option>
            {(brands ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
          >
            <option value="">No supplier</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Input
            label="Low stock threshold"
            type="number"
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            required
            error={formErrorVisible ? productFormErrors.lowStockThreshold || undefined : undefined}
          />
          <p className="text-xs text-text-muted">
            Required: name, sell price, cost price, and low stock threshold.
          </p>
        </div>
      </Modal>

      <Modal
        open={modal === 'stock'}
        onClose={() => setModal(null)}
        title={`Adjust stock — ${selected?.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              loading={adjustStock.isPending}
              onClick={() => {
                if (!stockDelta.trim() || !Number.isFinite(parseFloat(stockDelta))) return;
                adjustStock.mutate();
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-text-muted">Current: {selected?.stockQuantity}</p>
        <Input
          label="Quantity change (+/-)"
          type="number"
          value={stockDelta}
          onChange={(e) => setStockDelta(e.target.value)}
          required
        />
      </Modal>

      {canEdit && (data?.meta.total ?? 0) > 0 && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <p className="text-sm font-semibold text-rose-900">Danger zone</p>
          <p className="mt-1 text-xs text-rose-800">
            Remove all products from inventory. Sales history is kept. Export CSV first if you need
            a backup.
          </p>
          <Button className="mt-3" variant="danger" size="sm" onClick={() => setPurgeOpen(true)}>
            Clear all inventory
          </Button>
        </div>
      )}

      <Modal
        open={importOpen}
        onClose={resetImportState}
        title="Import inventory from CSV"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={downloadTemplate}>
              Download template
            </Button>
            <Button variant="ghost" onClick={resetImportState}>
              Cancel
            </Button>
            <Button
              loading={importProducts.isPending}
              disabled={
                importParsing || !importPreview || importPreview.count === 0 || !requiredMapped
              }
              onClick={() => importProducts.mutate()}
            >
              Import {importPreview?.count ?? 0} product(s)
            </Button>
          </>
        }
      >
        {importParsing ? (
          <div className="space-y-3 py-6 text-center text-sm text-text-muted">
            <PageSkeleton rows={4} />
            <p>Reading and matching CSV columns…</p>
          </div>
        ) : importPreview ? (
          <div className="space-y-4 text-sm">
            <p>
              Ready to import <strong>{importPreview.count}</strong> product row(s)
              {importPreview.count >= CSV_IMPORT_MAX_ROWS ? ` (max ${CSV_IMPORT_MAX_ROWS})` : ''}.
              Existing products match by SKU or barcode and will be updated.
            </p>

            {importHeaders.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3">
                <p className="font-semibold text-text">Match your CSV columns</p>
                <p className="mt-1 text-xs text-text-muted">
                  Headings were auto-matched where possible. Fix any wrong matches below so prices
                  and names do not import into the wrong fields.
                </p>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                  {INVENTORY_CSV_FIELD_META.map((meta) => (
                    <Select
                      key={meta.field}
                      label={`${meta.label}${meta.required ? ' *' : ''}`}
                      options={columnSelectOptions}
                      value={String(importMapping[meta.field] ?? -1)}
                      onChange={(e) => setFieldMapping(meta.field, Number(e.target.value))}
                    />
                  ))}
                </div>
                {importUnmatched.length > 0 && (
                  <p className="mt-3 text-xs text-text-muted">
                    Unused CSV columns (ignored): {importUnmatched.join(', ')}
                  </p>
                )}
              </div>
            )}

            {importPreview.errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <p className="font-medium">Parse warnings ({importPreview.errors.length})</p>
                <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-xs">
                  {importPreview.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {!requiredMapped && (
              <p className="text-xs font-medium text-danger">
                Map Product name and Sell price before importing.
              </p>
            )}
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
              Delete <strong className="text-text">{deleteTarget.name}</strong>? It will be removed
              from inventory and sales search. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete product"
        loading={deleteProduct.isPending}
      />
    </div>
  );
}
