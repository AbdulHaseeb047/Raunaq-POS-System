import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { ProductListPanel } from '@/components/catalog/ProductListPanel';
import { Badge } from '@/components/ui/Badge';
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
import type { Category } from '@/types/api';

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['categories', debouncedSearch],
    queryFn: () => api.categories.list(debouncedSearch.trim() || undefined),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: productsPage, isLoading: countsLoading } = useQuery({
    queryKey: ['products', 'category-counts'],
    queryFn: () => api.products.list({ pageSize: 500, skipCount: true }),
    staleTime: 60_000,
  });

  const productCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productsPage?.data ?? []) {
      const id = p.category?.id;
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [productsPage]);

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((c) => entityMatchesSearch([c.name], q));
  }, [data, search]);

  const save = useMutation({
    mutationFn: () =>
      editing ? api.categories.update(editing.id, { name }) : api.categories.create({ name }),
    onSuccess: () => {
      setModal(false);
      setEditing(null);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save category');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.categories.delete(id),
    onSuccess: (_, id) => {
      if (selected?.id === id) setSelected(null);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const currency = settings?.currency ?? 'PKR';
  const listLoading = isLoading || (isFetching && !data);

  if (listLoading) return <PageSkeleton rows={6} />;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <PageHeader
          title="Categories"
          subtitle="Click a category to view all linked products"
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setName('');
                setModal(true);
              }}
            >
              Add category
            </Button>
          }
        />
        <Input
          className="mb-3"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isFetching && (
          <div className="mb-3">
            <div className="skeleton-shine mb-2 h-14 rounded-xl bg-surface-muted" />
            <div className="skeleton-shine h-14 rounded-xl bg-surface-muted" />
          </div>
        )}
        <div
          className={`max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto ${isFetching ? 'opacity-70' : ''}`}
        >
          {filtered.map((cat) => {
            const count = productCountByCategory.get(cat.id) ?? 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelected(cat)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                  selected?.id === cat.id
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-border bg-surface hover:border-brand-200'
                }`}
              >
                <div>
                  <p className="font-semibold text-text">{cat.name}</p>
                  <p className="text-xs text-text-muted">
                    {countsLoading ? '…' : `${count} products`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={cat.isActive ? 'brand' : 'default'}>
                    {cat.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(cat);
                      setName(cat.name);
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
                      setDeleteTarget(cat);
                    }}
                  >
                    Del
                  </Button>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <Card className="text-center text-sm text-text-muted">No categories found.</Card>
          )}
        </div>
      </div>

      <div className="lg:col-span-3">
        {!selected ? (
          <Card className="flex h-64 items-center justify-center text-text-muted">
            Select a category to browse its products
          </Card>
        ) : (
          <ProductListPanel
            title={selected.name}
            subtitle={`Products in ${selected.name}`}
            categoryId={selected.id}
            currency={currency}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit category' : 'New category'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
        title="Delete category"
        message={
          deleteTarget ? (
            <>
              Delete category <strong className="text-text">{deleteTarget.name}</strong>? Products
              linked to it will remain but lose the category tag.
            </>
          ) : null
        }
        confirmLabel="Delete category"
        loading={remove.isPending}
      />
    </div>
  );
}
