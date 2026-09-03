'use client';

import { KeyRound, Save } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  formatDate,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@stokk/ui';

import { SettingsTabs } from './settings-tabs';
import { useSettings, useUpdateSettings } from '../../hooks/use-admin';
import { apiErrorMessage } from '../../lib/api';
import type { SettingsResponse } from '../../lib/api-types';
import { toDecimalString } from '../../lib/catalog-schemas';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

const PLAN_LABELS = { BASIC: 'Temel', PLUS: 'Plus', PREMIUM: 'Premium' } as const;
const TENANT_STATUS = {
  TRIAL: { label: 'Deneme', tone: 'brand' },
  ACTIVE: { label: 'Aktif', tone: 'success' },
  SUSPENDED: { label: 'Askıda', tone: 'danger' },
  CANCELLED: { label: 'İptal', tone: 'neutral' },
} as const;

interface FormState {
  name: string;
  legalName: string;
  taxNumber: string;
  taxOffice: string;
  phone: string;
  email: string;
  address: string;
  vatRates: string;
  defaultVatRate: string;
  negativeStockPolicy: 'WARN' | 'BLOCK';
  highDiscountThreshold: string;
  cashDifferenceThreshold: string;
  eArchiveThreshold: string;
  scaleBarcodePrefixes: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptPrinterName: string;
  receiptWidthMm: string;
  autoPrintReceipt: boolean;
  eInvoiceUsername: string;
  smsSenderTitle: string;
}

function toForm(data: SettingsResponse): FormState {
  return {
    name: data.tenant.name,
    legalName: data.tenant.legalName ?? '',
    taxNumber: data.tenant.taxNumber ?? '',
    taxOffice: data.tenant.taxOffice ?? '',
    phone: data.tenant.phone ?? '',
    email: data.tenant.email ?? '',
    address: data.tenant.address ?? '',
    vatRates: data.settings.vatRates.join(', '),
    defaultVatRate: String(data.settings.defaultVatRate),
    negativeStockPolicy: data.settings.negativeStockPolicy,
    highDiscountThreshold: data.settings.highDiscountThreshold,
    cashDifferenceThreshold: data.settings.cashDifferenceThreshold,
    eArchiveThreshold: data.settings.eArchiveThreshold,
    scaleBarcodePrefixes: data.settings.scaleBarcodePrefixes.join(', '),
    receiptHeader: data.settings.receiptHeader ?? '',
    receiptFooter: data.settings.receiptFooter ?? '',
    receiptPrinterName: data.settings.receiptPrinterName ?? '',
    receiptWidthMm: String(data.settings.receiptWidthMm),
    autoPrintReceipt: data.settings.autoPrintReceipt,
    eInvoiceUsername: data.settings.eInvoiceUsername ?? '',
    smsSenderTitle: data.settings.smsSenderTitle ?? '',
  };
}

/** "1, 10, 20" → [1, 10, 20]; bozuk parça atılır. */
function parseNumberList(raw: string): number[] {
  return raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 100);
}

function parsePrefixList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d{2,3}$/.test(part));
}

/**
 * Ayarlar ekranı: firma bilgileri, işletme kuralları, fiş/yazıcı, entegrasyon
 * kimlik bilgileri ve abonelik görünümü.
 *
 * KİMLİK BİLGİSİ KURALI: parola/anahtar alanları sunucudan yalnız MASKELİ gelir
 * ("••••1234"). Alan boş bırakılırsa istek gövdesine HİÇ konmaz, kayıtlı değer
 * korunur. Yeniden yazılmadıkça değişmez — Faz 11 doğrulaması bu davranışı ister.
 */
export function SettingsView(): ReactElement {
  const settings = useSettings();
  const update = useUpdateSettings();
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [eInvoiceSecret, setEInvoiceSecret] = useState('');
  const [smsApiKey, setSmsApiKey] = useState('');

  // Sunucudan yeni ayar geldiğinde form ondan doldurulur — render sırasında,
  // effect'te değil. Kullanıcının yazdığı değişiklikler yalnız YENİ yanıt geldiğinde
  // (kaydetme sonrası) sıfırlanır, her render'da değil.
  const [lastData, setLastData] = useState<SettingsResponse | null>(null);
  if (settings.data && settings.data !== lastData) {
    setLastData(settings.data);
    setForm(toForm(settings.data));
  }

  if (settings.isPending || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Ayarlar yükleniyor" />
      </div>
    );
  }
  if (settings.isError) return <FormBanner message={apiErrorMessage(settings.error)} />;

  const data = settings.data;

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function save(): void {
    if (!form) return;
    const vatRates = parseNumberList(form.vatRates);
    const defaultVatRate = Number.parseInt(form.defaultVatRate, 10);
    if (vatRates.length === 0) {
      toast.error('KDV oranları geçersiz', 'En az bir oran girin (ör. 1, 10, 20).');
      return;
    }
    if (!vatRates.includes(defaultVatRate)) {
      toast.error('Varsayılan KDV oranı listede yok', 'Önce oranlar listesine ekleyin.');
      return;
    }

    update.mutate(
      {
        name: form.name.trim(),
        legalName: form.legalName.trim(),
        taxNumber: form.taxNumber.trim(),
        taxOffice: form.taxOffice.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        vatRates,
        defaultVatRate,
        negativeStockPolicy: form.negativeStockPolicy,
        highDiscountThreshold: toDecimalString(form.highDiscountThreshold),
        cashDifferenceThreshold: toDecimalString(form.cashDifferenceThreshold),
        eArchiveThreshold: toDecimalString(form.eArchiveThreshold),
        scaleBarcodePrefixes: parsePrefixList(form.scaleBarcodePrefixes),
        receiptHeader: form.receiptHeader,
        receiptFooter: form.receiptFooter,
        receiptPrinterName: form.receiptPrinterName.trim(),
        receiptWidthMm: Number.parseInt(form.receiptWidthMm, 10) === 58 ? 58 : 80,
        autoPrintReceipt: form.autoPrintReceipt,
        eInvoiceUsername: form.eInvoiceUsername.trim(),
        smsSenderTitle: form.smsSenderTitle.trim(),
        // Boş bırakılan kimlik bilgisi GÖNDERİLMEZ → sunucuda kayıtlı değer korunur.
        ...(eInvoiceSecret ? { eInvoiceSecret } : {}),
        ...(smsApiKey ? { smsApiKey } : {}),
      },
      {
        onSuccess: () => {
          setEInvoiceSecret('');
          setSmsApiKey('');
          toast.success('Ayarlar kaydedildi');
        },
        onError: (error) => {
          toast.error('Ayarlar kaydedilemedi', apiErrorMessage(error));
        },
      },
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ayarlar"
        description="Firma bilgileri, işletme kuralları, fiş şablonu ve entegrasyonlar."
        actions={
          <Button loading={update.isPending} onClick={save}>
            <Save aria-hidden />
            Kaydet
          </Button>
        }
      />
      <SettingsTabs />

      {update.isError ? <FormBanner message={apiErrorMessage(update.error)} /> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Firma bilgileri</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="İşletme adı" required className="sm:col-span-2">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.name}
                  onChange={(e) => {
                    set('name', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Unvan" className="sm:col-span-2">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.legalName}
                  onChange={(e) => {
                    set('legalName', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Vergi no">
              {({ id }) => (
                <Input
                  id={id}
                  className="tabular"
                  value={form.taxNumber}
                  onChange={(e) => {
                    set('taxNumber', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Vergi dairesi">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.taxOffice}
                  onChange={(e) => {
                    set('taxOffice', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Telefon">
              {({ id }) => (
                <Input
                  id={id}
                  type="tel"
                  className="tabular"
                  value={form.phone}
                  onChange={(e) => {
                    set('phone', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="E-posta">
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    set('email', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Adres" className="sm:col-span-2">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={form.address}
                  onChange={(e) => {
                    set('address', e.target.value);
                  }}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Abonelik</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{PLAN_LABELS[data.tenant.plan]}</Badge>
              <Badge tone={TENANT_STATUS[data.tenant.status].tone}>
                {TENANT_STATUS[data.tenant.status].label}
              </Badge>
            </div>
            {data.tenant.trialEndsAt ? (
              <p className="text-ink-muted text-sm">
                Deneme süresi {formatDate(data.tenant.trialEndsAt)} tarihinde bitiyor.
              </p>
            ) : null}
            <p className="text-ink-muted text-sm">
              Plan yükseltme ve fatura görünümü abonelik fazında (Faz 15) açılacak.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>İşletme kuralları</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="KDV oranları"
              required
              hint="Virgülle ayırın. Ürün oranı bu listeden seçilir."
              className="sm:col-span-2"
            >
              {({ id }) => (
                <Input
                  id={id}
                  className="tabular"
                  value={form.vatRates}
                  onChange={(e) => {
                    set('vatRates', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Varsayılan KDV oranı" required>
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  className="tabular"
                  value={form.defaultVatRate}
                  onChange={(e) => {
                    set('defaultVatRate', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Negatif stok" hint="Engelle seçilirse stok sıfırın altına inemez.">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.negativeStockPolicy}
                  onChange={(e) => {
                    set('negativeStockPolicy', e.target.value as 'WARN' | 'BLOCK');
                  }}
                >
                  <option value="WARN">Uyar</option>
                  <option value="BLOCK">Engelle</option>
                </Select>
              )}
            </Field>
            <Field label="Yüksek indirim eşiği (%)" hint="Üzeri ayrı yetki ister.">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  className="tabular"
                  value={form.highDiscountThreshold}
                  onChange={(e) => {
                    set('highDiscountThreshold', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Kasa fark eşiği" hint="Vardiya kapanışında bu farkın üstü raporlanır.">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  className="tabular"
                  value={form.cashDifferenceThreshold}
                  onChange={(e) => {
                    set('cashDifferenceThreshold', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="e-Arşiv eşiği" hint="Bu tutarın üzerindeki satışlarda e-Arşiv üretilir.">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  className="tabular"
                  value={form.eArchiveThreshold}
                  onChange={(e) => {
                    set('eArchiveThreshold', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field
              label="Terazi barkod önekleri"
              hint="Virgülle ayırın (ör. 27, 28). Boşsa tartılı barkod kapalı."
            >
              {({ id }) => (
                <Input
                  id={id}
                  className="tabular"
                  value={form.scaleBarcodePrefixes}
                  onChange={(e) => {
                    set('scaleBarcodePrefixes', e.target.value);
                  }}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fiş ve yazıcı</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fiş başlığı" className="sm:col-span-2">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={form.receiptHeader}
                  onChange={(e) => {
                    set('receiptHeader', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Fiş altlığı" className="sm:col-span-2">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={form.receiptFooter}
                  onChange={(e) => {
                    set('receiptFooter', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Yazıcı adı" hint="POS ilk açılışta bunu önerir.">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.receiptPrinterName}
                  onChange={(e) => {
                    set('receiptPrinterName', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Fiş genişliği">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.receiptWidthMm}
                  onChange={(e) => {
                    set('receiptWidthMm', e.target.value);
                  }}
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </Select>
              )}
            </Field>
            <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
              <Checkbox
                className="mt-0.5"
                checked={form.autoPrintReceipt}
                onChange={(e) => {
                  set('autoPrintReceipt', e.target.checked);
                }}
              />
              <span>
                <span className="text-ink font-medium">Satış sonrası fişi otomatik bas</span>
                <span className="text-ink-muted block">Kapalıysa kasiyer fişi elle basar.</span>
              </span>
            </label>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" aria-hidden />
              Entegrasyon kimlik bilgileri
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-ink-muted text-sm">
              Parola ve anahtarlar şifreli saklanır, ekranda yalnız maskeli görünür.
              <strong className="text-ink"> Boş bırakırsanız kayıtlı değer değişmez.</strong>
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="e-Fatura kullanıcı adı">
                {({ id }) => (
                  <Input
                    id={id}
                    autoComplete="off"
                    value={form.eInvoiceUsername}
                    onChange={(e) => {
                      set('eInvoiceUsername', e.target.value);
                    }}
                  />
                )}
              </Field>
              <Field
                label="e-Fatura parolası"
                hint={
                  data.settings.eInvoiceSecretMask
                    ? `Kayıtlı: ${data.settings.eInvoiceSecretMask} — değiştirmek için yeni parolayı yazın.`
                    : 'Tanımlı değil.'
                }
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    placeholder={data.settings.eInvoiceSecretMask ?? 'Parola'}
                    aria-describedby={describedBy}
                    value={eInvoiceSecret}
                    onChange={(e) => {
                      setEInvoiceSecret(e.target.value);
                    }}
                  />
                )}
              </Field>

              <Field label="SMS başlığı" hint="Mesajlarda görünen gönderici adı.">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.smsSenderTitle}
                    onChange={(e) => {
                      set('smsSenderTitle', e.target.value);
                    }}
                  />
                )}
              </Field>
              <Field
                label="SMS API anahtarı"
                hint={
                  data.settings.smsApiKeyMask
                    ? `Kayıtlı: ${data.settings.smsApiKeyMask} — değiştirmek için yeni anahtarı yazın.`
                    : 'Tanımlı değil.'
                }
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    placeholder={data.settings.smsApiKeyMask ?? 'API anahtarı'}
                    aria-describedby={describedBy}
                    value={smsApiKey}
                    onChange={(e) => {
                      setSmsApiKey(e.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
