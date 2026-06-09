"use client";

import { useEffect, useMemo, useState } from "react";

export function usePagination(items, pageSize = 10, resetKey) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  const start = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(items.length, page * pageSize);

  return { page, setPage, totalPages, paged, start, end };
}
