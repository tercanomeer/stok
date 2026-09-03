export * from './contracts';
export * from './sale-calc';
export * from './purchase-calc';
export * from './change';
export * from './scale-barcode';
export { PosCoreError } from './money';

/** Hesaplama sözleşmesinin sürümü. POS ile sunucu arasında uyuşmazlık tespiti için. */
export const POS_CORE_CONTRACT_VERSION = 1 as const;
