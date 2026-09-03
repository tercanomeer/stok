import { describe, expect, it } from 'vitest';

import {
  listParamsToApiQuery,
  listParamsToQuery,
  nextSort,
  parseListParams,
  sortDirection,
  type ListParams,
} from './list-params';

const config = { filterKeys: ['categoryId', 'stock'] as const, defaultSort: 'name:asc' };

describe('parseListParams', () => {
  it('boş sorguda varsayılanları döner', () => {
    expect(parseListParams('', config)).toEqual({
      page: 1,
      limit: 20,
      search: '',
      sort: 'name:asc',
      filters: {},
    });
  });

  it('yalnız tanımlı filtre anahtarlarını alır', () => {
    const params = parseListParams('categoryId=c1&stock=low&brandId=b1', config);
    expect(params.filters).toEqual({ categoryId: 'c1', stock: 'low' });
  });

  it('bozuk sayfa ve limit değerleri varsayılana düşer', () => {
    const params = parseListParams('page=abc&limit=-5', config);
    expect(params.page).toBe(1);
    expect(params.limit).toBe(20);
  });

  it('limit sunucu üst sınırını aşamaz', () => {
    expect(parseListParams('limit=5000', config).limit).toBe(100);
  });
});

describe('listParamsToQuery', () => {
  const base: ListParams = { page: 1, limit: 20, search: '', sort: 'name:asc', filters: {} };

  it("varsayılan değerleri URL'e yazmaz", () => {
    expect(listParamsToQuery(base, config)).toBe('');
  });

  it('yalnız varsayılandan sapan alanları yazar', () => {
    const query = listParamsToQuery(
      { ...base, page: 3, search: 'kola', filters: { stock: 'low' } },
      config,
    );
    expect(query).toBe('page=3&search=kola&stock=low');
  });

  it('gidiş-dönüş aynı durumu üretir', () => {
    const params: ListParams = {
      page: 2,
      limit: 50,
      search: 'su',
      sort: 'salePrice:desc',
      filters: { categoryId: 'c1' },
    };
    expect(parseListParams(listParamsToQuery(params, config), config)).toEqual(params);
  });
});

describe('listParamsToApiQuery', () => {
  it('boş arama ve boş filtreyi göndermez', () => {
    const query = listParamsToApiQuery({
      page: 2,
      limit: 20,
      search: '',
      sort: 'name:asc',
      filters: { categoryId: '', stock: 'low' },
    });
    expect(query).toEqual({ page: 2, limit: 20, sort: 'name:asc', stock: 'low' });
  });
});

describe('sıralama', () => {
  it('aynı sütuna tıklayınca yön döner', () => {
    expect(nextSort('name:asc', 'name')).toBe('name:desc');
    expect(nextSort('name:desc', 'name')).toBe('name:asc');
  });

  it('farklı sütuna tıklayınca artan başlar', () => {
    expect(nextSort('name:desc', 'salePrice')).toBe('salePrice:asc');
  });

  it('sıralanmayan sütun için yön yok', () => {
    expect(sortDirection('name:asc', 'salePrice')).toBeNull();
    expect(sortDirection('name:desc', 'name')).toBe('desc');
  });
});
