import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compactPageNumbers, paginateItems } from '../assets/js/board-pagination.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('공지·문의 공통 페이지 계산은 10/10/나머지로 자르고 범위를 보정한다', () => {
 const items = Array.from({ length: 21 }, (_, index) => index + 1);
 assert.deepEqual(paginateItems(items, 1, 10).items, items.slice(0, 10));
 assert.deepEqual(paginateItems(items, 2, 10).items, items.slice(10, 20));
 assert.deepEqual(paginateItems(items, 3, 10).items, [21]);
 assert.equal(paginateItems(items, 99, 10).page, 3);
 assert.equal(paginateItems([], 4, 10).page, 1);
 assert.deepEqual(compactPageNumbers(5, 10, 1), [1, 4, 5, 6, 10]);
});

test('문의·공지 화면은 공통 10건 페이지네이션과 접근 가능한 행을 사용한다', async () => {
 const [qnaPage, noticePage, source, styles] = await Promise.all([
  read('pages/qna.html'),
  read('pages/notice.html'),
  read('assets/js/app-module.js'),
  read('assets/css/redesign.css')
 ]);
 assert.match(qnaPage, /id="questionPagination"[^>]*aria-label="문의 목록 페이지"/u);
 assert.match(noticePage, /id="noticePagination"[^>]*aria-label="공지사항 목록 페이지"/u);
 assert.match(source, /const QNA_PAGE_SIZE = 10/u);
 assert.match(source, /pageSize: 10/u);
 assert.match(source, /paginateItems\(qnaItems, window\.qnaPage, QNA_PAGE_SIZE\)/u);
 assert.match(source, /paginateItems\(filteredItems, noticeState\.page, noticeState\.pageSize\)/u);
 assert.match(source, /aria-current="page"/u);
 assert.match(source, /class="gp-board-row gp-board-row-button"/u);
 assert.match(styles, /\.gp-board-pagination button\{[\s\S]*?min-width:44px;[\s\S]*?height:44px;/u);
 assert.match(styles, /#qnaContent \.gp-qna-page\{[\s\S]*?grid-template-columns:/u);
});
