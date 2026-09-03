import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('GA4 setup 목록에 결제 정책 맞춤 측정기준 두 개를 EVENT 범위로 등록한다', async () => {
  const source = await read('scripts/ga4-cli.mjs');
  const start = source.indexOf('const CUSTOM_DIMENSIONS = [');
  const end = source.indexOf('];', start);
  const dimensions = source.slice(start, end);

  assert.match(dimensions, /\['Is First Purchase', 'is_first_purchase'\]/u);
  assert.match(dimensions, /\['Pricing Policy Version', 'pricing_policy_version'\]/u);
  assert.match(dimensions, /\['Product Mode Source Route', 'source_route'\]/u);
  assert.match(dimensions, /\['Product Mode Source Surface', 'source_surface'\]/u);
  assert.match(dimensions, /\['Product Mode Source Mode', 'source_mode'\]/u);
  assert.match(dimensions, /\['Product Mode Target Mode', 'target_mode'\]/u);
  assert.match(dimensions, /\['Humanize Diagnosis Source', 'diagnosis_source'\]/u);
  assert.match(source, /existingParams\.has\(parameterName\)[\s\S]*?continue;/u, '기존 측정기준은 다시 만들지 않는다');
  assert.match(source, /for \(const \[displayName, parameterName\] of CUSTOM_DIMENSIONS\)[\s\S]*?scope: 'EVENT'/u);
});
