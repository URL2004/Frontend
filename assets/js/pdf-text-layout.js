(function (root, factory) {
 'use strict';
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 else root.GPPdfTextLayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
 'use strict';

 // PDF text items are positioned glyph runs, not words. Adding a space to
 // every item destroys both word boundaries and the ownership of table cells.
 // Keep physical rows; never guess logical row spans or join across pages.
 function extractPage(content) {
  if ((content?.items?.length || 0) > 50000) throw new Error('PDF 한 페이지의 글자 조각이 너무 많아요. 필요한 부분만 나눠서 올려 주세요.');
  const items = (content?.items || []).filter(item => typeof item.str === 'string');
  if (items.reduce((sum, item) => sum + item.str.length, 0) > 30000) throw new Error('PDF에서 읽은 글이 30,000자를 넘어요. 필요한 부분만 나눠서 올려 주세요.');
  const visible = items.filter(item => item.str.trim());
  const positioned = visible.every(item => Array.isArray(item.transform)
   && item.transform.length >= 6 && item.transform.every(Number.isFinite)
   && Number.isFinite(item.width) && item.width >= 0
   && Math.abs(item.transform[1]) < 0.01 && Math.abs(item.transform[2]) < 0.01
   && item.transform[0] > 0 && item.transform[3] > 0 && item.dir !== 'rtl');
  if (!positioned) {
   // Unusual writing directions must not be sorted as horizontal LTR text.
   let text = '';
   for (const item of items) text += item.str + (item.hasEOL ? '\n' : '');
   return { text: text.trim(), reviewCodes: ['pdf_reading_order_review'], rowCount: 0, columnRowCount: 0 };
  }
  const ordered = visible.map((item, ordinal) => ({
   ...item, ordinal, x: item.transform[4], y: item.transform[5],
   h: Math.max(1, Math.abs(item.transform[3]))
  })).sort((a, b) => b.y - a.y || a.x - b.x || a.ordinal - b.ordinal);
  const rows = [];
  for (const item of ordered) {
   const row = rows.at(-1);
   if (row && Math.abs(row.y - item.y) <= Math.min(row.h, item.h) * 0.3) row.items.push(item);
   else rows.push({ y: item.y, h: item.h, items: [item] });
  }
  // Only a repeated, aligned large gap is a column candidate. A single long
  // indent or a justified word gap cannot create a table by itself.
  const gaps = [];
  rows.forEach((row, r) => {
   row.items.sort((a, b) => a.x - b.x || a.ordinal - b.ordinal);
   row.items.slice(1).forEach((item, i) => {
    const previous = row.items[i];
    if (item.x - previous.x - previous.width > Math.max(12, item.h * 1.5)) gaps.push({ r, x: item.x, h: item.h });
   });
  });
  const rowGaps = new Map();
  for (const gap of gaps) {
   if (!rowGaps.has(gap.r)) rowGaps.set(gap.r, []);
   rowGaps.get(gap.r).push(gap);
  }
  if ([...rowGaps.values()].some(gaps => gaps.length > 64)) throw new Error('PDF의 열 구성이 너무 복잡해요. 필요한 표나 본문만 나눠서 올려 주세요.');
  const columns = gaps.filter(g => [-3, -2, -1, 1, 2, 3].some(offset =>
   (rowGaps.get(g.r + offset) || []).some(other => Math.abs(other.x - g.x) <= Math.max(3, g.h * 0.5))));
  const rowColumns = new Map();
  for (const gap of columns) {
   if (!rowColumns.has(gap.r)) rowColumns.set(gap.r, []);
   rowColumns.get(gap.r).push(gap);
  }
  const columnRows = new Set(columns.map(g => g.r));
  const reviewCodes = [];
  if (columns.length) reviewCodes.push('pdf_columns_review');
  if (gaps.length > columns.length) reviewCodes.push('pdf_reading_order_review');
  let activeCuts = [];
  const rendered = rows.map((row, r) => {
   const previousRow = rows[r - 1];
   const paragraph = previousRow && previousRow.y - row.y > Math.max(previousRow.h, row.h) * 1.8;
   const ownCuts = (rowColumns.get(r) || []).map(g => g.x).sort((a, b) => a - b);
   if (ownCuts.length) activeCuts = ownCuts;
   else if (paragraph || /^(?:\d+(?:\.\d+)*[.)]|[ⅠⅡⅢⅣⅤ]+[.)]?|제\s*\d+\s*[장절])/u.test(row.items[0]?.str || '')
    || activeCuts.some(cut => row.items.some(item => item.x < cut - 3 && item.x + item.width > cut + 3))) activeCuts = [];
   // Keep empty cells in a wrapped table band. A short left cell must not make
   // the next right-column line look like an independent editable paragraph.
   if (activeCuts.length) columnRows.add(r);
   let out = '';
   let cell = 0;
   row.items.forEach((item, index) => {
    const previous = row.items[index - 1];
    // Internal whitespace is source text (possibly a quotation or code), not
    // an artificial separator. Only normalize boundaries between glyph runs.
    const value = item.str;
    const targetCell = activeCuts.filter(cut => item.x >= cut - Math.max(3, item.h * 0.5)).length;
    if (activeCuts.length && targetCell > cell) {
     out = out.trimEnd() + '\t'.repeat(targetCell - cell);
     cell = targetCell;
    } else if (previous) {
     const gap = item.x - previous.x - previous.width;
     // A one-off large gap is not a proven table band, but throwing the gap
     // away would still merge unrelated cells (especially a page's last row).
     const column = (rowGaps.get(r) || []).some(g => Math.abs(g.x - item.x) < 0.01);
     if (column) out = out.trimEnd() + '\t';
     else if (/\s$/u.test(previous.str) || /^\s/u.test(value) || gap > Math.max(0.5, item.h * 0.12)) out = out.trimEnd() + ' ';
    }
    out += value.trim();
   });
   if (activeCuts.length > cell) out += '\t'.repeat(activeCuts.length - cell);
   // Vertical whitespace remains a paragraph break, not just a space.
   return (r ? paragraph ? '\n\n' : '\n' : '') + out;
  });
  return { text: rendered.join(''), reviewCodes, rowCount: rows.length, columnRowCount: columnRows.size };
 }
 return { extractPage };
});
