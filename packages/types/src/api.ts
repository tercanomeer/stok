/** Her API yanıtı zarflıdır — CLAUDE.md "API sözleşmesi". */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiError {
  ok: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Sayfalama zarfı: ?page=1&limit=20&sort=createdAt:desc&search= */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
}

export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return response.ok === false;
}
