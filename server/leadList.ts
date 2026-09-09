export function normalizeLeadPagination(total: number, requestedPage: number, pageSize: number) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
  return {
    total: safeTotal,
    page,
    pageSize: safePageSize,
    totalPages,
    offset: (page - 1) * safePageSize,
  };
}
