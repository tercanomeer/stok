'use client';

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  cn,
  formatCount,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stokk/ui';

import { useUnits } from '../../hooks/use-catalog';
import { useImportJob, useStartImport } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';
import {
  duplicateMappedColumns,
  errorsToCsv,
  guessMapping,
  IMPORT_FIELDS,
  isMappingComplete,
  mapRows,
  toCanonicalRows,
  type ColumnMapping,
  type MappedRow,
  type ReportRow,
} from '../../lib/product-import';
import { buildCanonicalWorkbook, readProductSheet, type ParsedSheet } from '../../lib/xlsx-file';
import { LinkButton } from '../common/link-button';
import { FormBanner } from '../form-banner';

type Step = 'file' | 'mapping' | 'preview' | 'result';

const STEPS: { key: Step; label: string }[] = [
  { key: 'file', label: 'Dosya' },
  { key: 'mapping', label: 'Sütun eşleme' },
  { key: 'preview', label: 'Önizleme' },
  { key: 'result', label: 'Sonuç' },
];

const PREVIEW_LIMIT = 20;

/**
 * Toplu ürün import sihirbazı: dosya → sütun eşleme → önizleme → sonuç raporu.
 *
 * Sunucu sabit sütun düzeni beklediği için eşleme İSTEMCİDE uygulanır: dosya kanonik
 * düzende yeniden kurulup gönderilir. Satır numaraları korunur, bu yüzden sunucunun
 * hata raporundaki satır kullanıcının kendi dosyasındaki satırla aynıdır.
 */
export function ImportWizard(): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  // İş kimliği URL'de yaşar: 5.000 satırlık aktarım sürerken kullanıcı sekmeyi
  // yenileyip ya da ürünlere gidip geri dönünce sonucu yine görebilsin.
  const jobFromUrl = useSearchParams().get('job');

  const [step, setStep] = useState<Step>(jobFromUrl ? 'result' : 'file');
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(jobFromUrl);

  const fileInput = useRef<HTMLInputElement>(null);
  const units = useUnits();
  const startImport = useStartImport();
  const job = useImportJob(jobId);

  const knownUnits = useMemo(
    () => (units.data ?? []).flatMap((unit) => [unit.name, unit.abbreviation]),
    [units.data],
  );

  const mapped = useMemo<MappedRow[]>(
    () => (sheet && mapping ? mapRows(sheet.rows, mapping, knownUnits) : []),
    [sheet, mapping, knownUnits],
  );
  // Sonuç adımında iş bitene kadar 1 sn'de bir yoklama yapılıyor ve her yoklama
  // bu bileşeni yeniden render ediyor; 5.000 satırlık dizi her seferinde
  // filtrelenmesin diye memoize edildi (performance-engineer bulgusu).
  const invalidRows = useMemo(() => mapped.filter((row) => row.errors.length > 0), [mapped]);

  async function handleFile(selected: File): Promise<void> {
    setReading(true);
    setReadError(null);
    try {
      const parsed = await readProductSheet(selected);
      if (parsed.rows.length === 0) {
        setReadError('Dosyada veri satırı bulunamadı. İlk satır başlık, kalanı ürün olmalı.');
        return;
      }
      setFile(selected);
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
      setStep('mapping');
    } catch (error) {
      setReadError(
        error instanceof Error ? error.message : 'Dosya okunamadı. Geçerli bir .xlsx seçin.',
      );
    } finally {
      setReading(false);
    }
  }

  async function handleUpload(): Promise<void> {
    if (!file || mapped.length === 0) return;
    const rebuilt = await buildCanonicalWorkbook(toCanonicalRows(mapped), file.name);
    startImport.mutate(rebuilt, {
      onSuccess: (result) => {
        setJobId(result.jobId);
        router.replace(`${pathname}?job=${result.jobId}`, { scroll: false });
        setStep('result');
      },
    });
  }

  function downloadErrorReport(): void {
    const nameByRow = new Map(mapped.map((row) => [row.row, row.name]));
    const rows: ReportRow[] = (job.data?.errors ?? []).map((error) => ({
      row: error.row,
      message: error.message,
      field: error.field,
      name: nameByRow.get(error.row),
    }));
    const blob = new Blob([errorsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hatali-satirlar.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function restart(): void {
    router.replace(pathname, { scroll: false });
    setStep('file');
    setFile(null);
    setSheet(null);
    setMapping(null);
    setJobId(null);
    startImport.reset();
  }

  const duplicates = mapping ? duplicateMappedColumns(mapping) : [];
  const mappingReady = mapping !== null && isMappingComplete(mapping) && duplicates.length === 0;

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-2" aria-label="İçe aktarma adımları">
        {STEPS.map((item, index) => {
          const current = STEPS.findIndex((s) => s.key === step);
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <li key={item.key} className="flex items-center gap-2">
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'rounded-control flex items-center gap-2 px-2.5 py-1 text-sm',
                  state === 'current' && 'bg-brand-weak text-brand-weak-ink font-medium',
                  state === 'done' && 'text-ink-muted',
                  state === 'todo' && 'text-ink-subtle',
                )}
              >
                <span className="tabular">{index + 1}.</span>
                {item.label}
              </span>
              {index < STEPS.length - 1 ? (
                <ArrowRight className="text-ink-subtle size-4" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      {step === 'file' ? (
        <Card>
          <CardHeader>
            <CardTitle>Excel dosyası seçin</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {readError ? <FormBanner message={readError} /> : null}
            <p className="text-ink-muted text-sm">
              İlk satır başlık olmalı. Sütunların sırası önemli değil — sonraki adımda hangi sütunun
              ne olduğunu siz eşleyeceksiniz.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Excel dosyası seç"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                e.target.value = '';
                if (selected) void handleFile(selected);
              }}
            />
            <Button
              loading={reading}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              <FileSpreadsheet aria-hidden />
              Dosya seç (.xlsx)
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {step === 'mapping' && sheet && mapping ? (
        <Card>
          <CardHeader>
            <CardTitle>Sütunları eşleyin</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-ink-muted text-sm">
              {file?.name} · {formatCount(sheet.rows.length)} veri satırı bulundu. Başlıklardan
              tanınanlar otomatik seçildi.
            </p>

            {duplicates.length > 0 ? (
              <FormBanner message="Aynı sütunu birden fazla alana eşleyemezsiniz." />
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {IMPORT_FIELDS.map((field) => {
                const selectedIndex = mapping[field.key];
                return (
                  <label key={field.key} className="flex flex-col gap-1.5">
                    <span className="text-ink text-sm font-medium">
                      {field.label}
                      {field.required ? (
                        <span className="text-danger ml-0.5" aria-hidden>
                          *
                        </span>
                      ) : null}
                    </span>
                    <Select
                      value={String(selectedIndex)}
                      invalid={field.required && selectedIndex === -1}
                      onChange={(e) => {
                        setMapping({
                          ...mapping,
                          [field.key]: Number.parseInt(e.target.value, 10),
                        });
                      }}
                    >
                      <option value="-1">{field.required ? 'Seçin…' : 'Kullanma'}</option>
                      {sheet.headers.map((header, index) => (
                        <option key={`${header}-${String(index)}`} value={index}>
                          {header || `(${String(index + 1)}. sütun)`}
                        </option>
                      ))}
                    </Select>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={restart}>
                <ArrowLeft aria-hidden />
                Dosya değiştir
              </Button>
              <Button
                disabled={!mappingReady}
                onClick={() => {
                  setStep('preview');
                }}
              >
                Önizle
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 'preview' ? (
        <Card>
          <CardHeader>
            <CardTitle>Önizleme</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {startImport.isError ? (
              <FormBanner message={apiErrorMessage(startImport.error)} />
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{formatCount(mapped.length)} satır</Badge>
              {invalidRows.length > 0 ? (
                <Badge tone="danger">
                  <TriangleAlert aria-hidden />
                  {formatCount(invalidRows.length)} hatalı satır
                </Badge>
              ) : (
                <Badge tone="success">
                  <CheckCircle2 aria-hidden />
                  Hatalı satır yok
                </Badge>
              )}
            </div>

            {invalidRows.length > 0 ? (
              <p className="text-ink-muted text-sm">
                Hatalı satırlar da gönderilir; sunucu sağlam satırları oluşturur, hatalıları rapora
                yazar. Satır numaraları dosyanızdakiyle aynıdır.
              </p>
            ) : null}

            <div className="border-border rounded-control max-h-96 overflow-auto border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH numeric>Satır</TH>
                    <TH>Ürün adı</TH>
                    <TH>Kod</TH>
                    <TH>Birim</TH>
                    <TH numeric>Fiyat</TH>
                    <TH numeric>KDV</TH>
                    <TH>Barkod</TH>
                    <TH>Durum</TH>
                  </TR>
                </THead>
                <TBody>
                  {mapped.slice(0, PREVIEW_LIMIT).map((row) => (
                    <TR
                      key={row.row}
                      className={row.errors.length > 0 ? 'bg-danger-weak/40' : undefined}
                    >
                      <TD numeric className="text-ink-muted">
                        {row.row}
                      </TD>
                      <TD>{row.name || '—'}</TD>
                      <TD>{row.code || '—'}</TD>
                      <TD>{row.unit || '—'}</TD>
                      <TD numeric>{row.salePrice || '—'}</TD>
                      <TD numeric>{row.vatRate || '—'}</TD>
                      <TD className="tabular">{row.barcode || '—'}</TD>
                      <TD>
                        {row.errors.length === 0 ? (
                          <span className="text-success text-sm">Hazır</span>
                        ) : (
                          <span className="text-danger text-sm">
                            {row.errors.map((issue) => issue.message).join(' ')}
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            {mapped.length > PREVIEW_LIMIT ? (
              <p className="text-ink-muted text-sm">
                İlk {PREVIEW_LIMIT} satır gösteriliyor; tamamı aktarılacak.
              </p>
            ) : null}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('mapping');
                }}
              >
                <ArrowLeft aria-hidden />
                Eşlemeye dön
              </Button>
              <Button
                loading={startImport.isPending}
                onClick={() => {
                  void handleUpload();
                }}
              >
                <Upload aria-hidden />
                {formatCount(mapped.length)} satırı aktar
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 'result' ? (
        <Card>
          <CardHeader>
            <CardTitle>Sonuç</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {job.isError ? <FormBanner message={apiErrorMessage(job.error)} /> : null}

            {!job.data || job.data.status === 'PENDING' || job.data.status === 'PROCESSING' ? (
              <div className="flex items-center gap-3 py-6" aria-live="polite">
                <Spinner label="Dosya işleniyor, bu ekranı kapatabilirsiniz" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
                  <ResultTile label="Toplam satır" value={job.data.totalRows} />
                  <ResultTile label="Oluşturulan" value={job.data.createdCount} tone="success" />
                  <ResultTile
                    label="Hatalı"
                    value={job.data.errorCount}
                    tone={job.data.errorCount > 0 ? 'danger' : 'neutral'}
                  />
                  <ResultTile label="İşlenen" value={job.data.processedRows} />
                </div>

                {job.data.status === 'FAILED' ? (
                  <FormBanner message="Dosya işlenemedi. Aşağıdaki hata listesine bakın." />
                ) : null}

                {job.data.errors && job.data.errors.length > 0 ? (
                  <>
                    <div className="border-border rounded-control max-h-72 overflow-auto border">
                      <Table>
                        <THead>
                          <TR className="hover:bg-transparent">
                            <TH numeric>Satır</TH>
                            <TH>Alan</TH>
                            <TH>Hata</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {job.data.errors.map((error, index) => (
                            <TR key={`${String(error.row)}-${String(index)}`}>
                              <TD numeric className="text-ink-muted">
                                {error.row}
                              </TD>
                              <TD>{error.field ?? '—'}</TD>
                              <TD className="text-danger">{error.message}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                    <Button variant="outline" onClick={downloadErrorReport}>
                      <Download aria-hidden />
                      Hatalı satırları indir (CSV)
                    </Button>
                  </>
                ) : null}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={restart}>
                    Yeni dosya aktar
                  </Button>
                  <LinkButton href="/products">Ürünlere dön</LinkButton>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function ResultTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}): ReactElement {
  return (
    <div className="rounded-card border-border bg-surface-sunken border p-3">
      <p className="text-ink-muted text-xs">{label}</p>
      <p
        className={cn(
          'tabular text-xl font-semibold',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
        )}
      >
        {formatCount(value)}
      </p>
    </div>
  );
}
