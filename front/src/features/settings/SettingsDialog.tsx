import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { FC, SVGProps } from 'react';

import { RaunaqLogo } from '@/components/brand/RaunaqLogo';
import {
  IconDownload,
  IconKey,
  IconPrinter,
  IconReceipt,
  IconStaff,
  IconStore,
  IconUser,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/Spinner';
import { Select } from '@/components/ui/Select';
import { ChangePasswordForm } from '@/features/settings/ChangePasswordForm';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { downloadCsv, INVENTORY_CSV_HEADERS, productToCsvRow } from '@/lib/csv-utils';
import { FEATURES, hasFeature } from '@/lib/features';
import {
  clearReceiptPrefs,
  loadReceiptPrefs,
  saveReceiptPrefs,
  type ReceiptAfterSalePrefs,
} from '@/lib/receipt-prefs';
import { downloadSalesReportPdf } from '@/lib/sales-pdf';

export type SettingsTabId =
  'account' | 'password' | 'business' | 'receipts' | 'printer' | 'staff' | 'data';

type SettingsDialogProps = {
  open: boolean;
  tab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  onClose: () => void;
};

type TabDef = {
  id: SettingsTabId;
  label: string;
  hint: string;
  show: boolean;
  icon: FC<SVGProps<SVGSVGElement>>;
};

const TAB_ICONS: Record<SettingsTabId, FC<SVGProps<SVGSVGElement>>> = {
  account: IconUser,
  password: IconKey,
  business: IconStore,
  receipts: IconReceipt,
  printer: IconPrinter,
  staff: IconStaff,
  data: IconDownload,
};

export function SettingsDialog({ open, tab, onTabChange, onClose }: SettingsDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [printerMsg, setPrinterMsg] = useState('');
  const [printerErr, setPrinterErr] = useState('');
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const canView = hasFeature(user, FEATURES.SETTINGS_VIEW);
  const canEdit = hasFeature(user, FEATURES.SETTINGS_EDIT);
  const canPrint = hasFeature(user, FEATURES.BILLING_PRINT_RECEIPT);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    enabled: open && canView,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const tabs = useMemo<TabDef[]>(
    () =>
      (
        [
          {
            id: 'account' as const,
            label: 'Account',
            hint: 'Profile',
            show: true,
          },
          {
            id: 'password' as const,
            label: 'Password',
            hint: 'Security',
            show: true,
          },
          {
            id: 'business' as const,
            label: 'Business',
            hint: 'Shop profile',
            show: canView,
          },
          {
            id: 'receipts' as const,
            label: 'Receipts',
            hint: 'Header & tax',
            show: canView,
          },
          {
            id: 'printer' as const,
            label: 'Printer',
            hint: 'Slip printing',
            show: canView && canPrint,
          },
          {
            id: 'staff' as const,
            label: 'Staff limits',
            hint: 'Discount cap',
            show: canView,
          },
          {
            id: 'data' as const,
            label: 'Data',
            hint: 'Export',
            show: canView && canEdit,
          },
        ] as const
      )
        .filter((t) => t.show)
        .map((t) => ({ ...t, icon: TAB_ICONS[t.id] })),
    [canView, canEdit, canPrint],
  );

  useEffect(() => {
    if (!open) return;
    if (!tabs.some((t) => t.id === tab)) {
      onTabChange(tabs[0]?.id ?? 'account');
    }
  }, [open, tab, tabs, onTabChange]);

  const formValue = (key: string, fallback: string | boolean = ''): string | boolean => {
    if (key in form) return form[key];
    if (!data) return fallback;
    const v = data[key as keyof typeof data];
    if (v == null) return fallback;
    if (typeof v === 'boolean') return v;
    return String(v);
  };

  const update = useMutation({
    mutationFn: () =>
      api.settings.update({
        businessName: String(formValue('businessName', data?.businessName)),
        address: String(formValue('address', data?.address ?? '')) || null,
        phone: String(formValue('phone', data?.phone ?? '')) || null,
        logoUrl: String(formValue('logoUrl', data?.logoUrl ?? '')) || null,
        currency: String(formValue('currency', data?.currency ?? 'PKR')),
        taxLabel: String(formValue('taxLabel', data?.taxLabel ?? 'Tax')),
        defaultTaxRate: parseFloat(
          String(formValue('defaultTaxRate', data?.defaultTaxRate ?? '0')),
        ),
        receiptFooter: String(formValue('receiptFooter', data?.receiptFooter ?? '')) || null,
        receiptHeaderMode: String(
          formValue('receiptHeaderMode', data?.receiptHeaderMode ?? 'NAME'),
        ) as 'NAME' | 'LOGO' | 'BOTH',
        printReceiptsDefault: Boolean(
          formValue('printReceiptsDefault', data?.printReceiptsDefault ?? false),
        ),
        showReceiptAfterSale: Boolean(
          formValue('showReceiptAfterSale', data?.showReceiptAfterSale ?? true),
        ),
        maxDiscountPercentStaff: formValue(
          'maxDiscountPercentStaff',
          data?.maxDiscountPercentStaff ?? '',
        )
          ? parseFloat(
              String(formValue('maxDiscountPercentStaff', data?.maxDiscountPercentStaff ?? '')),
            )
          : null,
        printerMode: String(formValue('printerMode', data?.printerMode ?? 'BROWSER')) as
          'BROWSER' | 'NETWORK',
        printerHost: String(formValue('printerHost', data?.printerHost ?? '')) || null,
        printerPort: parseInt(
          String(formValue('printerPort', String(data?.printerPort ?? 9100))),
          10,
        ),
        printerPaperWidth: parseInt(
          String(formValue('printerPaperWidth', String(data?.printerPaperWidth ?? 80))),
          10,
        ) as 58 | 80,
      }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const printerTest = useMutation({
    mutationFn: () => api.settings.printerTest(),
    onSuccess: () => {
      setPrinterErr('');
      setPrinterMsg('Test slip sent to printer.');
      setTimeout(() => setPrinterMsg(''), 4000);
    },
    onError: (err) => {
      setPrinterMsg('');
      setPrinterErr(err instanceof ApiError ? err.message : 'Printer test failed');
    },
  });

  if (!open) return null;

  const showSave =
    canEdit &&
    canView &&
    (tab === 'business' || tab === 'receipts' || tab === 'printer' || tab === 'staff');

  const active = tabs.find((t) => t.id === tab);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-text/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close settings"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex h-[min(720px,100dvh)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:h-[min(720px,92vh)] sm:rounded-2xl md:flex-row"
      >
        {/* Left rail — desktop */}
        <aside className="hidden w-56 shrink-0 flex-col bg-sidebar text-text-inverse md:flex">
          <div className="border-b border-sidebar-border px-3 py-3.5">
            <RaunaqLogo variant="compact" tone="dark" className="scale-90 origin-left" />
            <p className="mt-2.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200/75">
              Settings
            </p>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {tabs.map((item) => {
              const selected = item.id === tab;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`sidebar-nav-link group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-200 ${
                    selected
                      ? 'bg-sidebar-active text-white shadow-sm'
                      : 'text-brand-100/90 hover:bg-sidebar-hover hover:text-white'
                  }`}
                >
                  <span className="sidebar-nav-icon-wrap flex shrink-0 items-center justify-center">
                    <Icon className="sidebar-nav-icon h-4 w-4 opacity-90" />
                  </span>
                  <span className="sidebar-nav-label min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-tight">
                      {item.label}
                    </span>
                    <span
                      className={`block text-[11px] leading-tight ${
                        selected
                          ? 'text-white/75'
                          : 'text-brand-200/65 group-hover:text-brand-100/80'
                      }`}
                    >
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border p-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full cursor-pointer rounded-xl px-3 py-2 text-left text-xs font-semibold text-brand-200/80 transition hover:bg-sidebar-hover hover:text-white"
            >
              Close
            </button>
          </div>
        </aside>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-3.5">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-text">
                {active?.label ?? 'Settings'}
              </h2>
              <p className="truncate text-xs text-text-muted">{active?.hint}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showSave && (
                <Button size="sm" loading={update.isPending} onClick={() => update.mutate()}>
                  {saved ? 'Saved ✓' : 'Save'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                ✕
              </Button>
            </div>
          </div>

          {/* Mobile tab strip */}
          <div className="flex gap-1 overflow-x-auto border-b border-border bg-surface-muted/50 px-2 py-2 md:hidden">
            {tabs.map((item) => {
              const selected = item.id === tab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    selected ? 'bg-brand-600 text-white' : 'bg-white text-text border border-border'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === 'account' && <AccountPanel onChangePassword={() => onTabChange('password')} />}
            {tab === 'password' && <ChangePasswordForm />}
            {tab !== 'account' && tab !== 'password' && (!canView || isLoading || !data) && (
              <PageLoader />
            )}
            {canView && data && tab === 'business' && (
              <BusinessPanel
                canEdit={canEdit}
                formValue={formValue}
                setForm={setForm}
                form={form}
              />
            )}
            {canView && data && tab === 'receipts' && (
              <ReceiptsPanel
                canEdit={canEdit}
                canPrint={canPrint}
                data={data}
                form={form}
                formValue={formValue}
                setForm={setForm}
              />
            )}
            {canView && data && tab === 'printer' && canPrint && (
              <PrinterPanel
                canEdit={canEdit}
                data={data}
                form={form}
                formValue={formValue}
                setForm={setForm}
                printerMsg={printerMsg}
                printerErr={printerErr}
                printerLoading={printerTest.isPending}
                onTest={() => {
                  setPrinterErr('');
                  setPrinterMsg('');
                  printerTest.mutate();
                }}
              />
            )}
            {canView && data && tab === 'staff' && (
              <StaffPanel canEdit={canEdit} formValue={formValue} form={form} setForm={setForm} />
            )}
            {canView && data && tab === 'data' && canEdit && (
              <DataPanel businessName={data.businessName} currency={data.currency} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountPanel({ onChangePassword }: { onChangePassword: () => void }) {
  const { user } = useAuth();
  const canPrint = hasFeature(user, FEATURES.BILLING_PRINT_RECEIPT);
  const [prefs, setPrefs] = useState(() => loadReceiptPrefs(user?.id));
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    setPrefs(loadReceiptPrefs(user?.id));
  }, [user?.id]);

  const persist = (next: ReceiptAfterSalePrefs) => {
    if (!user?.id) return;
    setPrefs(next);
    saveReceiptPrefs(user.id, next);
    setSavedMsg('Saved for this login');
    window.setTimeout(() => setSavedMsg(''), 2500);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-text">Your account</h3>
        <p className="mt-1 text-xs text-text-muted">Login details for this POS user.</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface-muted/40 px-4 py-3">
        <p className="text-sm font-semibold text-text">{user?.fullName}</p>
        <p className="text-xs text-text-muted">{user?.email}</p>
      </div>
      <button
        type="button"
        onClick={onChangePassword}
        className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
          <IconKey className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Change password</span>
          <span className="block text-xs text-text-muted">Update your login password</span>
        </span>
        <span className="text-text-muted">›</span>
      </button>

      <div className="space-y-3 rounded-2xl border border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text">My receipt preferences</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Applies only to this login on this device. Leave unchecked options to use the shop
            default from Settings → Receipts.
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded"
            checked={prefs.showReceiptAfterSale === true}
            onChange={(e) =>
              persist({
                ...prefs,
                showReceiptAfterSale: e.target.checked ? true : undefined,
              })
            }
          />
          <span>
            <span className="font-medium text-text">Always show receipt after sale</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              Force the on-screen receipt for this user.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded"
            checked={prefs.showReceiptAfterSale === false}
            onChange={(e) =>
              persist({
                ...prefs,
                showReceiptAfterSale: e.target.checked ? false : undefined,
              })
            }
          />
          <span>
            <span className="font-medium text-text">Skip receipt screen after sale</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              Close checkout and keep selling — open History when you need a reprint.
            </span>
          </span>
        </label>
        {canPrint && (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded"
                checked={prefs.printReceiptsDefault === true}
                onChange={(e) =>
                  persist({
                    ...prefs,
                    printReceiptsDefault: e.target.checked ? true : undefined,
                  })
                }
              />
              <span>
                <span className="font-medium text-text">Always auto-print</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Print immediately when a sale is saved.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded"
                checked={prefs.printReceiptsDefault === false}
                onChange={(e) =>
                  persist({
                    ...prefs,
                    printReceiptsDefault: e.target.checked ? false : undefined,
                  })
                }
              />
              <span>
                <span className="font-medium text-text">Never auto-print</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Only print when you press Print on the receipt.
                </span>
              </span>
            </label>
          </>
        )}
        {(prefs.showReceiptAfterSale !== undefined || prefs.printReceiptsDefault !== undefined) && (
          <button
            type="button"
            className="text-xs font-medium text-brand-700 hover:underline"
            onClick={() => {
              if (!user?.id) return;
              clearReceiptPrefs(user.id);
              setPrefs({});
              setSavedMsg('Using shop defaults');
              window.setTimeout(() => setSavedMsg(''), 2500);
            }}
          >
            Clear my overrides (use shop defaults)
          </button>
        )}
        {savedMsg && <p className="text-xs font-medium text-emerald-700">{savedMsg}</p>}
      </div>
    </div>
  );
}

function BusinessPanel({
  canEdit,
  form,
  formValue,
  setForm,
}: {
  canEdit: boolean;
  form: Record<string, string | boolean>;
  formValue: (key: string, fallback?: string | boolean) => string | boolean;
  setForm: (v: Record<string, string | boolean>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Shop name and contact details shown on receipts.</p>
      <Input
        label="Business name"
        value={String(formValue('businessName'))}
        onChange={(e) => setForm({ ...form, businessName: e.target.value })}
        disabled={!canEdit}
      />
      <Input
        label="Phone"
        value={String(formValue('phone'))}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        disabled={!canEdit}
      />
      <Input
        label="Address"
        value={String(formValue('address'))}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        disabled={!canEdit}
      />
    </div>
  );
}

function ReceiptsPanel({
  canEdit,
  canPrint,
  data,
  form,
  formValue,
  setForm,
}: {
  canEdit: boolean;
  canPrint: boolean;
  data: { receiptHeaderMode?: string; logoUrl?: string | null };
  form: Record<string, string | boolean>;
  formValue: (key: string, fallback?: string | boolean) => string | boolean;
  setForm: (v: Record<string, string | boolean>) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-text">Invoice header</h3>
        <Select
          label="Header style"
          value={String(formValue('receiptHeaderMode', data.receiptHeaderMode ?? 'NAME'))}
          onChange={(e) => setForm({ ...form, receiptHeaderMode: e.target.value })}
          disabled={!canEdit}
          options={[
            { value: 'NAME', label: 'Print shop name only' },
            { value: 'LOGO', label: 'Print logo only' },
            { value: 'BOTH', label: 'Print logo + shop name' },
          ]}
        />
        <div>
          <p className="mb-1.5 text-xs font-medium text-text">Shop logo</p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={!canEdit}
            className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 400_000) {
                window.alert('Logo must be under 400KB. Compress the image and try again.');
                e.target.value = '';
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setForm({ ...form, logoUrl: String(reader.result ?? '') });
              };
              reader.readAsDataURL(file);
            }}
          />
          <p className="mt-1 text-[11px] text-text-muted">
            PNG/JPG/WebP under 400KB works best on thermal slips.
          </p>
        </div>
        {(String(formValue('logoUrl', data.logoUrl ?? '')) || data.logoUrl) && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-muted/40 p-3">
            <img
              src={String(formValue('logoUrl', data.logoUrl ?? ''))}
              alt="Shop logo preview"
              className="max-h-14 max-w-[140px] object-contain"
            />
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setForm({ ...form, logoUrl: '' })}
              >
                Remove logo
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-text">Receipts & tax</h3>
        <Input
          label="Currency code"
          value={String(formValue('currency'))}
          onChange={(e) => setForm({ ...form, currency: e.target.value })}
          disabled={!canEdit}
        />
        <Input
          label="Tax label"
          value={String(formValue('taxLabel'))}
          onChange={(e) => setForm({ ...form, taxLabel: e.target.value })}
          disabled={!canEdit}
        />
        <Input
          label="Default tax rate (%)"
          type="number"
          value={String(formValue('defaultTaxRate'))}
          onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })}
          disabled={!canEdit}
        />
        <Input
          label="Your receipt footer (optional)"
          value={String(formValue('receiptFooter'))}
          onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
          disabled={!canEdit}
          placeholder="e.g. Exchange within 7 days"
        />
        <div className="rounded-xl border border-border bg-surface-muted/50 px-3 py-3 text-xs text-text-muted">
          <p className="mb-1 font-semibold text-text">Locked on every slip</p>
          <p>System developed by NexMindSystems</p>
          <div className="mt-1 flex justify-between gap-2">
            <span>www.NexMindSystems.com</span>
            <span className="font-medium text-text">03462734539</span>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 px-3 py-3">
          <div>
            <p className="text-sm font-semibold text-text">After each sale (shop default)</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Staff can override these for their own login under Account.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(formValue('showReceiptAfterSale', true))}
              onChange={(e) => setForm({ ...form, showReceiptAfterSale: e.target.checked })}
              disabled={!canEdit}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <span>
              <span className="font-medium text-text">Show receipt on screen</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Open the receipt preview after checkout so you can review or print.
              </span>
            </span>
          </label>
          {canPrint && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(formValue('printReceiptsDefault', false))}
                onChange={(e) => setForm({ ...form, printReceiptsDefault: e.target.checked })}
                disabled={!canEdit}
                className="mt-0.5 h-4 w-4 rounded"
              />
              <span>
                <span className="font-medium text-text">Auto-print receipt</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Send to the printer as soon as the sale is saved (works with or without the
                  on-screen preview).
                </span>
              </span>
            </label>
          )}
        </div>
      </section>
    </div>
  );
}

function PrinterPanel({
  canEdit,
  data,
  form,
  formValue,
  setForm,
  printerMsg,
  printerErr,
  printerLoading,
  onTest,
}: {
  canEdit: boolean;
  data: {
    printerMode?: string;
    printerHost?: string | null;
    printerPort?: number | null;
    printerPaperWidth?: number | null;
  };
  form: Record<string, string | boolean>;
  formValue: (key: string, fallback?: string | boolean) => string | boolean;
  setForm: (v: Record<string, string | boolean>) => void;
  printerMsg: string;
  printerErr: string;
  printerLoading: boolean;
  onTest: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Browser print for USB printers, or direct ESC/POS over network.
      </p>
      <Select
        label="Print method"
        value={String(formValue('printerMode', data.printerMode ?? 'BROWSER'))}
        onChange={(e) => setForm({ ...form, printerMode: e.target.value })}
        disabled={!canEdit}
        options={[
          { value: 'BROWSER', label: 'Browser print (USB / Windows default)' },
          { value: 'NETWORK', label: 'Network thermal printer (ESC/POS)' },
        ]}
      />

      {String(formValue('printerMode', data.printerMode ?? 'BROWSER')) === 'NETWORK' && (
        <>
          <Input
            label="Printer IP address"
            value={String(formValue('printerHost', data.printerHost ?? ''))}
            onChange={(e) => setForm({ ...form, printerHost: e.target.value })}
            disabled={!canEdit}
            placeholder="e.g. 192.168.1.100"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Port"
              type="number"
              value={String(formValue('printerPort', String(data.printerPort ?? 9100)))}
              onChange={(e) => setForm({ ...form, printerPort: e.target.value })}
              disabled={!canEdit}
            />
            <Select
              label="Paper width"
              value={String(formValue('printerPaperWidth', String(data.printerPaperWidth ?? 80)))}
              onChange={(e) => setForm({ ...form, printerPaperWidth: e.target.value })}
              disabled={!canEdit}
              options={[
                { value: '80', label: '80 mm (standard)' },
                { value: '58', label: '58 mm' },
              ]}
            />
          </div>
          {canEdit && (
            <Button variant="secondary" loading={printerLoading} onClick={onTest}>
              Send test print
            </Button>
          )}
          {printerMsg && <p className="text-xs text-emerald-700">{printerMsg}</p>}
          {printerErr && <p className="text-xs text-danger">{printerErr}</p>}
        </>
      )}

      <div className="rounded-xl border border-border bg-surface-muted/60 p-3 text-xs text-text-muted">
        <p className="font-semibold text-text">How to connect</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>USB:</strong> Install driver, set as Windows default, choose Browser print.
          </li>
          <li>
            <strong>Network:</strong> Enter printer IP, save, then Send test print.
          </li>
        </ul>
      </div>
    </div>
  );
}

function StaffPanel({
  canEdit,
  form,
  formValue,
  setForm,
}: {
  canEdit: boolean;
  form: Record<string, string | boolean>;
  formValue: (key: string, fallback?: string | boolean) => string | boolean;
  setForm: (v: Record<string, string | boolean>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Cap how much discount staff can give at the counter (separate from managing staff accounts).
      </p>
      <Input
        label="Max discount % for staff"
        type="number"
        value={String(formValue('maxDiscountPercentStaff'))}
        onChange={(e) => setForm({ ...form, maxDiscountPercentStaff: e.target.value })}
        disabled={!canEdit}
        hint="Staff without unlimited discount are capped at this %"
      />
    </div>
  );
}

function DataPanel({ businessName, currency }: { businessName: string; currency: string }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Download shop data for backup or reporting.</p>
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            const all = await api.products.list({ pageSize: 5000 });
            const rows = [[...INVENTORY_CSV_HEADERS], ...all.data.map((p) => productToCsvRow(p))];
            downloadCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
          }}
        >
          Export inventory (CSV)
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const sales = await api.sales.list(1, 500);
            downloadSalesReportPdf(sales.data, currency ?? 'PKR', businessName ?? 'Shop');
          }}
        >
          Export sales (PDF)
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const backup = await api.settings.export();
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Backup customers &amp; ledger (JSON)
        </Button>
      </div>
    </div>
  );
}
