import { describe, expect, it } from 'vitest';

import { createMockFiscal, nullFiscal } from './fiscal';
import { createMockPosDevice, nullPosDevice } from './pos-device';
import type { ReceiptData } from '../shared/ipc-contracts';

const RECEIPT: ReceiptData = {
  receiptNo: '1042',
  clientSaleId: 'client-1',
  soldAt: '2026-09-04T11:59:00.000Z',
  registerName: 'Kasa 1',
  cashierName: 'Kasiyer Ali',
  contactName: null,
  lines: [],
  subtotal: '80.00',
  discountTotal: '0.00',
  vatBreakdown: [],
  vatTotal: '0.00',
  grandTotal: '80.00',
  payments: [],
  changeDue: '0.00',
  header: null,
  footer: null,
  currency: 'TRY',
};

describe('nullPosDevice', () => {
  it('her çağrı "cihaz tanımlı değil" der — sessizce başarılı olmaz', async () => {
    await expect(nullPosDevice.ping()).rejects.toMatchObject({ code: 'DEVICE_NOT_CONFIGURED' });
    await expect(nullPosDevice.pay({ amount: '10.00', referenceId: 'r1' })).rejects.toMatchObject({
      code: 'DEVICE_NOT_CONFIGURED',
    });
  });
});

describe('createMockPosDevice', () => {
  it('ödemeyi onaylar ve referansı geri verir', async () => {
    const device = createMockPosDevice();

    const result = await device.pay({ amount: '80.00', referenceId: 'ref-1' });

    expect(result).toMatchObject({ referenceId: 'ref-1', status: 'approved', amount: '80.00' });
    expect(result.authCode).toHaveLength(6);
  });

  it('yarım kalmış işlemin akıbeti sorulabilir', async () => {
    // Asıl senaryo: kasa çöktü ya da kablo çıktı; "ödeme geçti mi?" sorusunun
    // cevabı ancak referansla alınır. Bu yüzden `query` arayüzün parçası.
    const device = createMockPosDevice();
    await device.pay({ amount: '80.00', referenceId: 'ref-1' });

    await expect(device.query('ref-1')).resolves.toMatchObject({ status: 'approved' });
  });

  it('bilinmeyen referans "bilinmiyor" döner, uydurmaz', async () => {
    const device = createMockPosDevice();
    await expect(device.query('yok')).resolves.toMatchObject({
      status: 'unknown',
      amount: null,
    });
  });

  it('iptal edilen işlem artık bulunmaz', async () => {
    const device = createMockPosDevice();
    await device.pay({ amount: '80.00', referenceId: 'ref-1' });

    await device.cancel('ref-1');

    await expect(device.query('ref-1')).resolves.toMatchObject({ status: 'unknown' });
  });
});

describe('ÖKC', () => {
  it('tanımsız cihaz açık hata verir', async () => {
    await expect(nullFiscal.registerSale(RECEIPT)).rejects.toMatchObject({
      code: 'DEVICE_NOT_CONFIGURED',
    });
  });

  it('sahte cihaz mali fiş no ve karekod üretir', async () => {
    const fiscal = createMockFiscal();

    const first = await fiscal.registerSale(RECEIPT);
    const second = await fiscal.registerSale(RECEIPT);

    expect(first.fiscalNo).toBe('Z000001');
    expect(second.fiscalNo).toBe('Z000002');
    // Karekod gerçek GİB doğrulama adresinin biçimini taklit ediyor ki fiş
    // şablonu gerçek cihazda uzunluk sürprizi yaşamasın.
    expect(first.qrData).toContain('ebelge.gib.gov.tr');
    expect(first.qrData).toContain(RECEIPT.grandTotal);
  });
});
