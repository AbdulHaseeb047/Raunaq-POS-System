import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/api-client';
import { downloadCsv, productToCsvRow, INVENTORY_CSV_HEADERS } from '@/lib/csv-utils';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { downloadSalesReportPdf } from '@/lib/sales-pdf';

export function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [printerMsg, setPrinterMsg] = useState('');
  const [printerErr, setPrinterErr] = useState('');

  const canEdit = hasFeature(user, FEATURES.SETTINGS_EDIT);
  const canPrint = hasFeature(user, FEATURES.BILLING_PRINT_RECEIPT);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const formValue = (key: string, fallback: string | boolean = '') => {
    if (key in form) return form[key];
    if (!data) return fallback;
    const v = data[key as keyof typeof data];
    return v ?? fallback;
  };

  const update = useMutation({
    mutationFn: () =>
      api.settings.update({
        businessName: String(formValue('businessName', data?.businessName)),
        address: String(formValue('address', data?.address ?? '')) || null,
        phone: String(formValue('phone', data?.phone ?? '')) || null,
        currency: String(formValue('currency', data?.currency ?? 'PKR')),
        taxLabel: String(formValue('taxLabel', data?.taxLabel ?? 'Tax')),
        defaultTaxRate: parseFloat(String(formValue('defaultTaxRate', data?.defaultTaxRate ?? '0'))),
        receiptFooter: String(formValue('receiptFooter', data?.receiptFooter ?? '')) || null,
        printReceiptsDefault: Boolean(formValue('printReceiptsDefault', data?.printReceiptsDefault ?? true)),
        maxDiscountPercentStaff: formValue('maxDiscountPercentStaff', data?.maxDiscountPercentStaff ?? '')
          ? parseFloat(String(formValue('maxDiscountPercentStaff', data?.maxDiscountPercentStaff ?? '')))
          : null,
        printerMode: String(formValue('printerMode', data?.printerMode ?? 'BROWSER')) as 'BROWSER' | 'NETWORK',
        printerHost: String(formValue('printerHost', data?.printerHost ?? '')) || null,
        printerPort: parseInt(String(formValue('printerPort', String(data?.printerPort ?? 9100))), 10),
        printerPaperWidth: parseInt(String(formValue('printerPaperWidth', String(data?.printerPaperWidth ?? 80))), 10) as 58 | 80,
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

  if (isLoading || !data) return <PageLoader />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Business profile and POS preferences"
        action={
          canEdit ? (
            <Button loading={update.isPending} onClick={() => update.mutate()}>
              {saved ? 'Saved ✓' : 'Save changes'}
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <CardHeader title="Account" subtitle="Your login credentials" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text">{user?.fullName}</p>
            <p className="text-xs text-text-muted">{user?.email}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/account/password')}>
            Change password
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Business profile" />
        <div className="space-y-4">
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
      </Card>

      <Card className="mb-6">
        <CardHeader title="Receipts & tax" />
        <div className="space-y-4">
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
            label="Receipt footer"
            value={String(formValue('receiptFooter'))}
            onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
            disabled={!canEdit}
          />
          {canPrint && (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(formValue('printReceiptsDefault', true))}
                onChange={(e) => setForm({ ...form, printReceiptsDefault: e.target.checked })}
                disabled={!canEdit}
                className="h-4 w-4 rounded"
              />
              Print receipts by default
            </label>
          )}
        </div>
      </Card>

      {canPrint && (
      <Card className="mb-6">
        <CardHeader
          title="Slip printer"
          subtitle="Browser print for USB printers, or direct ESC/POS over network (Ethernet/WiFi)"
        />
        <div className="space-y-4">
          <Select
            label="Print method"
            value={String(formValue('printerMode', data?.printerMode ?? 'BROWSER'))}
            onChange={(e) => setForm({ ...form, printerMode: e.target.value })}
            disabled={!canEdit}
            options={[
              { value: 'BROWSER', label: 'Browser print (USB / Windows default printer)' },
              { value: 'NETWORK', label: 'Network thermal printer (ESC/POS, port 9100)' },
            ]}
          />

          {String(formValue('printerMode', data?.printerMode ?? 'BROWSER')) === 'NETWORK' && (
            <>
              <Input
                label="Printer IP address"
                value={String(formValue('printerHost', data?.printerHost ?? ''))}
                onChange={(e) => setForm({ ...form, printerHost: e.target.value })}
                disabled={!canEdit}
                placeholder="e.g. 192.168.1.100"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Port"
                  type="number"
                  value={String(formValue('printerPort', String(data?.printerPort ?? 9100)))}
                  onChange={(e) => setForm({ ...form, printerPort: e.target.value })}
                  disabled={!canEdit}
                />
                <Select
                  label="Paper width"
                  value={String(formValue('printerPaperWidth', String(data?.printerPaperWidth ?? 80)))}
                  onChange={(e) => setForm({ ...form, printerPaperWidth: e.target.value })}
                  disabled={!canEdit}
                  options={[
                    { value: '80', label: '80 mm (standard)' },
                    { value: '58', label: '58 mm' },
                  ]}
                />
              </div>
              {canEdit && (
                <Button
                  variant="secondary"
                  loading={printerTest.isPending}
                  onClick={() => {
                    setPrinterErr('');
                    setPrinterMsg('');
                    printerTest.mutate();
                  }}
                >
                  Send test print
                </Button>
              )}
              {printerMsg && <p className="text-xs text-emerald-700">{printerMsg}</p>}
              {printerErr && <p className="text-xs text-danger">{printerErr}</p>}
            </>
          )}

          <div className="rounded-xl border border-border bg-surface-muted/60 p-3 text-xs text-text-muted">
            <p className="font-semibold text-text">How to connect your slip printer</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>USB printer:</strong> Install the driver in Windows, set it as default printer, choose
                &quot;Browser print&quot;, and use Print receipt (80mm paper size in print dialog).
              </li>
              <li>
                <strong>Network printer:</strong> Connect printer to shop WiFi/LAN, print its self-test page to find
                the IP, enter that IP here, save, then use &quot;Send test print&quot;.
              </li>
              <li>
                The POS PC and printer must be on the same network. Port 9100 is used for most Epson/Xprinter
                thermal printers.
              </li>
            </ul>
          </div>
        </div>
      </Card>
      )}

      <Card>
        <CardHeader title="Staff limits" />
        <Input
          label="Max discount % for staff"
          type="number"
          value={String(formValue('maxDiscountPercentStaff'))}
          onChange={(e) => setForm({ ...form, maxDiscountPercentStaff: e.target.value })}
          disabled={!canEdit}
          hint="Staff without unlimited discount feature are capped at this %"
        />
      </Card>

      {canEdit && (
        <Card className="mt-6">
          <CardHeader title="Data export" subtitle="Download shop data — sales export as PDF, not JSON" />
          <div className="flex flex-wrap gap-2">
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
                downloadSalesReportPdf(
                  sales.data,
                  data?.currency ?? 'PKR',
                  data?.businessName ?? 'Shop',
                );
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
          <p className="mt-3 text-xs text-text-muted">
            Sales records are exported as a printable PDF report. Use Sales History to download individual
            invoice PDFs. Inventory CSV import is on the Inventory page.
          </p>
        </Card>
      )}
    </div>
  );
}
