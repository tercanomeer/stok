import { QueryClient } from '@tanstack/react-query';

/** Uygulama genel query istemcisi. 401 yeniden denemesi interceptor'da; burada tekrar deneme kapalı. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
