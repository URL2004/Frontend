export function paginateItems(items, requestedPage = 1, requestedPageSize = 10) {
 const source = Array.isArray(items) ? items : [];
 const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
  ? Math.floor(requestedPageSize)
  : 10;
 const totalItems = source.length;
 const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
 const numericPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
 const page = Math.min(Math.max(1, numericPage), totalPages);
 const startIndex = (page - 1) * pageSize;
 const pageItems = source.slice(startIndex, startIndex + pageSize);
 return {
  page,
  pageSize,
  totalItems,
  totalPages,
  startIndex,
  endIndex: startIndex + pageItems.length,
  items: pageItems
 };
}

export function compactPageNumbers(currentPage, totalPages, windowSize = 1) {
 const safeTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
 const safeCurrent = Math.min(Math.max(1, Math.floor(Number(currentPage) || 1)), safeTotal);
 const safeWindow = Math.max(0, Math.floor(Number(windowSize) || 0));
 const visiblePages = new Set([1, safeTotal]);
 for (let page = safeCurrent - safeWindow; page <= safeCurrent + safeWindow; page += 1) {
  if (page >= 1 && page <= safeTotal) visiblePages.add(page);
 }
 return [...visiblePages].sort((a, b) => a - b);
}
