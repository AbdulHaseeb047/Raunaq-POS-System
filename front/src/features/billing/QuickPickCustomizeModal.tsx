import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { productMatchesSearch } from '@/lib/search-match';
import { useToast } from '@/components/ui/Toast';
import type { Product } from '@/types/api';

const MAX_QUICK_PICK = 40;

export function QuickPickCustomizeModal({
  open,
  onClose,
  initialIds,
}: {
  open: boolean;
  onClose: () => void;
  initialIds: string[];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [ids, setIds] = useState<string[]>(initialIds);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);

  useEffect(() => {
    if (open) {
      setIds(initialIds);
      setSearch('');
    }
  }, [open, initialIds]);

  const { data: selectedPage } = useQuery({
    queryKey: ['products', 'quick-pick-edit', ids],
    queryFn: () => api.products.list({ ids, activeOnly: true, pageSize: MAX_QUICK_PICK }),
    enabled: open && ids.length > 0,
  });

  const { data: searchPage, isFetching: searching } = useQuery({
    queryKey: ['products', 'quick-pick-search', debouncedSearch],
    queryFn: () =>
      api.products.list({
        search: debouncedSearch.trim() || undefined,
        page: 1,
        pageSize: 30,
        activeOnly: true,
      }),
    enabled: open,
  });

  const selectedProducts = useMemo(() => {
    const byId = new Map((selectedPage?.data ?? []).map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  }, [selectedPage?.data, ids]);

  const searchResults = useMemo(() => {
    const rows = searchPage?.data ?? [];
    const q = search.trim();
    const filtered = q ? rows.filter((p) => productMatchesSearch(p, q)) : rows;
    return filtered.filter((p) => !ids.includes(p.id)).slice(0, 20);
  }, [searchPage?.data, search, ids]);

  const save = useMutation({
    mutationFn: () => api.settings.update({ saleQuickPickIds: ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['products', 'sale-quick-pick'] });
      toast.success('Quick pick updated');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save Quick pick');
    },
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= ids.length) return;
    setIds((prev) => {
      const copy = [...prev];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  };

  const addProduct = (p: Product) => {
    if (ids.includes(p.id) || ids.length >= MAX_QUICK_PICK) return;
    setIds((prev) => [...prev, p.id]);
  };

  const removeId = (id: string) => setIds((prev) => prev.filter((x) => x !== id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Quick pick"
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="secondary" onClick={() => setIds([])}>
            Clear all
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-sm text-text-muted">
        Choose up to {MAX_QUICK_PICK} products shown first on the Sale screen when no category or
        search is active. Leave empty to use the default product list.
      </p>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Selected ({ids.length}/{MAX_QUICK_PICK})
        </label>
        {ids.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
            No favorites yet — search below to add products.
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
            {selectedProducts.map((p, index) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                  {p.name}
                </span>
                <button
                  type="button"
                  className="rounded px-1.5 text-xs font-semibold text-text-muted hover:bg-white"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 text-xs font-semibold text-text-muted hover:bg-white"
                  onClick={() => move(index, 1)}
                  disabled={index === ids.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  onClick={() => removeId(p.id)}
                >
                  Remove
                </button>
              </li>
            ))}
            {ids.length > selectedProducts.length && (
              <li className="px-2 py-1 text-xs text-text-muted">Loading selected products…</li>
            )}
          </ul>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Add products
        </label>
        <input
          className="mb-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
          placeholder="Search by name, SKU, or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
          {searching && searchResults.length === 0 ? (
            <li className="px-2 py-3 text-sm text-text-muted">Searching…</li>
          ) : searchResults.length === 0 ? (
            <li className="px-2 py-3 text-sm text-text-muted">No matching products</li>
          ) : (
            searchResults.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-text">{p.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={ids.length >= MAX_QUICK_PICK}
                  onClick={() => addProduct(p)}
                >
                  Add
                </Button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Modal>
  );
}
