import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api-client';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import type { DiscountRule } from '@/types/api';

const emptyForm = {
  name: '',
  discountType: 'PERCENTAGE',
  value: '',
  appliesTo: 'BILL',
  productId: '',
  categoryId: '',
  minBillAmount: '',
  isActive: true,
};

export function DiscountsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<DiscountRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showInactive, setShowInactive] = useState(true);
  const [toggleTarget, setToggleTarget] = useState<{
    id: string;
    isActive: boolean;
    name: string;
  } | null>(null);

  const canUnlimited = hasFeature(user, FEATURES.BILLING_DISCOUNT_UNLIMITED);

  const { data, isLoading } = useQuery({
    queryKey: ['discounts', showInactive],
    queryFn: () => api.discounts.list(showInactive),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'discounts'],
    queryFn: () => api.products.list({ pageSize: 100 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        discountType: form.discountType,
        value: parseFloat(form.value),
        appliesTo: form.appliesTo,
        productId: form.productId || null,
        categoryId: form.categoryId || null,
        minBillAmount: form.minBillAmount ? parseFloat(form.minBillAmount) : null,
        isActive: form.isActive,
      };
      return editing ? api.discounts.update(editing.id, body) : api.discounts.create(body);
    },
    onSuccess: () => {
      setModal(false);
      setEditing(null);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ['discounts'] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.discounts.update(id, { isActive }),
    onSuccess: () => {
      setToggleTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['discounts'] });
    },
  });

  const openEdit = (d: DiscountRule) => {
    setEditing(d);
    setForm({
      name: d.name,
      discountType: d.discountType,
      value: d.value,
      appliesTo: d.appliesTo,
      productId: d.productId ?? '',
      categoryId: d.categoryId ?? '',
      minBillAmount: d.minBillAmount ?? '',
      isActive: d.isActive,
    });
    setModal(true);
  };

  if (isLoading) return <PageLoader />;

  const activeCount = (data ?? []).filter((d) => d.isActive).length;
  const totalUsage = (data ?? []).reduce((s, d) => s + (d.usageCount ?? 0), 0);
  const totalGiven = (data ?? []).reduce((s, d) => s + parseFloat(d.totalDiscountGiven ?? '0'), 0);

  return (
    <div>
      <PageHeader
        title="Discount rules"
        subtitle="Promotions, bill discounts, and item-level offers"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? 'Hide inactive' : 'Show all'}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setModal(true);
              }}
            >
              Add rule
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card padding="md" className="bg-brand-50/50">
          <p className="text-xs font-semibold uppercase text-text-muted">Active rules</p>
          <p className="mt-1 text-2xl font-black text-brand-800">{activeCount}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold uppercase text-text-muted">Times used</p>
          <p className="mt-1 text-2xl font-black text-text">{totalUsage}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold uppercase text-text-muted">Total discount given</p>
          <p className="mt-1 text-2xl font-black text-text">Rs {totalGiven.toFixed(2)}</p>
        </Card>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm">
        <span className="font-medium">Permission:</span>{' '}
        {canUnlimited ? (
          <Badge variant="brand">Manager — unlimited discount</Badge>
        ) : (
          <Badge variant="warning">Cashier — capped by staff max % in settings</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((d) => (
          <Card
            key={d.id}
            hover
            className={`relative overflow-hidden ${!d.isActive ? 'opacity-60' : ''}`}
          >
            <div
              className={`absolute left-0 top-0 h-full w-1 ${d.isActive ? 'bg-brand-500' : 'bg-border'}`}
            />
            <div className="flex items-start justify-between gap-2 pl-2">
              <div>
                <p className="font-semibold text-text">{d.name}</p>
                <p className="mt-1 text-2xl font-bold text-brand-700">
                  {d.discountType === 'PERCENTAGE' ? `${d.value}%` : `Rs ${d.value}`}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {d.appliesTo === 'BILL' ? 'Entire bill' : 'Item / category'}
                  {d.minBillAmount && ` · Min bill Rs ${d.minBillAmount}`}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded-lg bg-surface-muted px-2 py-1.5">
                    <p className="text-text-muted">Used</p>
                    <p className="font-bold text-text">{d.usageCount ?? 0}×</p>
                  </div>
                  <div className="rounded-lg bg-surface-muted px-2 py-1.5">
                    <p className="text-text-muted">Given</p>
                    <p className="font-bold text-text">Rs {d.totalDiscountGiven ?? '0.00'}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={d.isActive ? 'brand' : 'default'}>
                  {d.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="default">{d.appliesTo}</Badge>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setToggleTarget({ id: d.id, isActive: !d.isActive, name: d.name })}
              >
                {d.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit discount rule' : 'New discount rule'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              {editing ? 'Save' : 'Create'}
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
          <Select
            label="Type"
            value={form.discountType}
            onChange={(e) => setForm({ ...form, discountType: e.target.value })}
            options={[
              { value: 'PERCENTAGE', label: 'Percentage' },
              { value: 'FLAT', label: 'Flat amount (Rs)' },
            ]}
          />
          <Input
            label="Value"
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <Select
            label="Scope"
            value={form.appliesTo}
            onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}
            options={[
              { value: 'BILL', label: 'Entire bill' },
              { value: 'ITEM', label: 'Item / category specific' },
            ]}
          />
          {form.appliesTo === 'ITEM' && (
            <>
              <Select
                label="Category (optional)"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                options={[
                  { value: '', label: 'Any category' },
                  ...(categories?.map((c) => ({ value: c.id, label: c.name })) ?? []),
                ]}
              />
              <Select
                label="Product (optional)"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                options={[
                  { value: '', label: 'Any product in scope' },
                  ...(products?.data.map((p) => ({ value: p.id, label: p.name })) ?? []),
                ]}
              />
            </>
          )}
          <Input
            label="Min purchase (optional)"
            type="number"
            value={form.minBillAmount}
            onChange={(e) => setForm({ ...form, minBillAmount: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={toggleTarget != null}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => {
          if (toggleTarget)
            toggleActive.mutate({ id: toggleTarget.id, isActive: toggleTarget.isActive });
        }}
        title={toggleTarget?.isActive ? 'Activate discount rule' : 'Deactivate discount rule'}
        message={
          toggleTarget ? (
            <>
              {toggleTarget.isActive ? 'Activate' : 'Deactivate'}{' '}
              <strong className="text-text">{toggleTarget.name}</strong>?
              {!toggleTarget.isActive && ' Staff will no longer be able to apply this discount.'}
            </>
          ) : null
        }
        confirmLabel={toggleTarget?.isActive ? 'Activate' : 'Deactivate'}
        variant={toggleTarget?.isActive ? 'primary' : 'danger'}
        loading={toggleActive.isPending}
      />
    </div>
  );
}
