import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { ProductListPanel } from '@/components/catalog/ProductListPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useToast } from '@/components/ui/Toast';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { api } from '@/lib/api-client';
import { entityMatchesSearch } from '@/lib/search-match';
import type { Brand } from '@/types/api';

export function BrandsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Brand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['brands', debouncedSearch],
    queryFn: () => api.brands.list(debouncedSearch || undefined),
    placeholderData: (prev) => prev,
  });

  const { data: productsPage } = useQuery({
    queryKey: ['products', 'brand-counts'],
    queryFn: () => api.products.list({ pageSize: 500 }),
  });

  const productCountByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productsPage?.data ?? []) {
      const id = p.brand?.id;
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [productsPage]);

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((b) => entityMatchesSearch([b.name], q));
  }, [data, search]);

  const save = useMutation({
    mutationFn: () =>
      editing ? api.brands.update(editing.id, { name }) : api.brands.create({ name }),
    onSuccess: () => {
      setModal(false);
      setEditing(null);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save brand');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.brands.delete(id),
    onSuccess: (_, id) => {
      if (selected?.id === id) setSelected(null);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
  });

  const currency = settings?.currency ?? 'PKR';

  if (isLoading && !data) return <PageSkeleton rows={6} />;

  return (
    <div className={`grid gap-6 lg:grid-cols-5 ${isFetching ? 'opacity-90' : ''}`}>
      <div className="lg:col-span-2">
        <PageHeader
          title="Brands"
          subtitle="Click a brand to view all linked products"
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setName('');
                setModal(true);
              }}
            >
              Add brand
            </Button>
          }
        />
        <Input
          className="mb-3"
          placeholder="Search brands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto">
          {filtered.map((b) => {
            const count = productCountByBrand.get(b.id) ?? 0;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                  selected?.id === b.id
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-border bg-surface hover:border-brand-200'
                }`}
              >
                <div>
                  <p className="font-semibold text-text">{b.name}</p>
                  <p className="text-xs text-text-muted">{count} products</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(b);
                      setName(b.name);
                      setModal(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(b);
                    }}
                  >
                    Del
                  </Button>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <Card className="text-center text-sm text-text-muted">No brands found.</Card>
          )}
        </div>
      </div>

      <div className="lg:col-span-3">
        {!selected ? (
          <Card className="flex h-64 items-center justify-center text-text-muted">
            Select a brand to browse its products
          </Card>
        ) : (
          <ProductListPanel
            title={selected.name}
            subtitle={`Products by ${selected.name}`}
            brandId={selected.id}
            currency={currency}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit brand' : 'New brand'}
        footer={
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        }
      >
        <Input label="Brand name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
        title="Delete brand"
        message={
          deleteTarget ? (
            <>
              Delete brand <strong className="text-text">{deleteTarget.name}</strong>? Products
              linked to this brand will remain but lose the brand tag.
            </>
          ) : null
        }
        confirmLabel="Delete brand"
        loading={remove.isPending}
      />
    </div>
  );
}
