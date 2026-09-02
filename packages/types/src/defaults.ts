/**
 * Yeni tenant'ın varsayılan kataloğu. Hem kayıt akışı (apps/api) hem seed (packages/db)
 * buradan okur — tek doğruluk kaynağı. Birim olmadan ürün oluşturulamadığı için kayıt
 * anında bunlar yazılır.
 */
export interface DefaultUnit {
  name: string;
  abbreviation: string;
  allowsDecimal: boolean;
}

export const DEFAULT_UNITS: readonly DefaultUnit[] = [
  { name: 'Adet', abbreviation: 'ad', allowsDecimal: false },
  { name: 'Kilogram', abbreviation: 'kg', allowsDecimal: true },
  { name: 'Gram', abbreviation: 'gr', allowsDecimal: true },
  { name: 'Litre', abbreviation: 'lt', allowsDecimal: true },
  { name: 'Mililitre', abbreviation: 'ml', allowsDecimal: true },
  { name: 'Metre', abbreviation: 'm', allowsDecimal: true },
  { name: 'Paket', abbreviation: 'pk', allowsDecimal: false },
  { name: 'Kutu', abbreviation: 'kt', allowsDecimal: false },
  { name: 'Koli', abbreviation: 'kl', allowsDecimal: false },
];

export const DEFAULT_CATEGORIES: readonly string[] = [
  'Gıda',
  'İçecek',
  'Temizlik',
  'Kişisel Bakım',
  'Kırtasiye',
  'Tütün Mamulleri',
  'Diğer',
];

export const DEFAULT_EXPENSE_CATEGORIES: readonly string[] = [
  'Kira',
  'Elektrik',
  'Su',
  'Doğalgaz',
  'İnternet & Telefon',
  'Personel',
  'Nakliye',
  'Diğer',
];
