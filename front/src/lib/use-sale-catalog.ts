import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api-client';
import type { Product } from '@/types/api';

const SALE_CATALOG_STALE_MS = 5 * 60 * 1000;
const CHUNK_SIZE = 200;
const MAX_PAGES = 10;

/** Prefetch first catalog chunk (call from dashboard after login). */
export function prefetchSaleCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.prefetchQuery({
    queryKey: ['products', 'sale-catalog', 'chunk', 1],
    queryFn: () =>
      api.products.list({
        page: 1,
        pageSize: CHUNK_SIZE,
        activeOnly: true,
        skipCount: true,
      }),
    staleTime: SALE_CATALOG_STALE_MS,
  });
}

/**
 * Loads the sale catalog in small chunks so search works after the first page,
 * then fills the rest in the background without blocking the register.
 */
export function useSaleCatalog() {
  const queryClient = useQueryClient();
  const [extraProducts, setExtraProducts] = useState<Product[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    data: firstPage,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['products', 'sale-catalog', 'chunk', 1],
    queryFn: () =>
      api.products.list({
        page: 1,
        pageSize: CHUNK_SIZE,
        activeOnly: true,
        skipCount: true,
      }),
    staleTime: SALE_CATALOG_STALE_MS,
  });

  useEffect(() => {
    const first = firstPage?.data;
    if (!first || first.length < CHUNK_SIZE) {
      setExtraProducts([]);
      return;
    }

    let cancelled = false;
    setLoadingMore(true);

    void (async () => {
      const acc: Product[] = [];
      try {
        // Fetch remaining pages in small parallel batches to cut wall-clock time.
        for (let page = 2; page <= MAX_PAGES; page += 2) {
          const batch = [page, page + 1].filter((p) => p <= MAX_PAGES);
          const results = await Promise.all(
            batch.map((p) =>
              queryClient.fetchQuery({
                queryKey: ['products', 'sale-catalog', 'chunk', p],
                queryFn: () =>
                  api.products.list({
                    page: p,
                    pageSize: CHUNK_SIZE,
                    activeOnly: true,
                    skipCount: true,
                  }),
                staleTime: SALE_CATALOG_STALE_MS,
              }),
            ),
          );
          if (cancelled) return;
          let shortPage = false;
          for (const next of results) {
            acc.push(...next.data);
            if (next.data.length < CHUNK_SIZE) shortPage = true;
          }
          setExtraProducts([...acc]);
          if (shortPage) break;
        }
      } finally {
        if (!cancelled) setLoadingMore(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firstPage?.data, queryClient]);

  const products = useMemo(
    () => [...(firstPage?.data ?? []), ...extraProducts],
    [firstPage?.data, extraProducts],
  );

  return {
    products,
    isLoading,
    isFetching: isFetching || loadingMore,
    loadingMore,
    catalogReady: !isLoading && !!firstPage,
  };
}

export { SALE_CATALOG_STALE_MS };
