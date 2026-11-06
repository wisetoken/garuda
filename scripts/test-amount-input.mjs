import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTokenInput, readTokenInput, tokenInputCaret } from '../src/lib/market/amount-input.ts';
import { parseAmount } from '../src/lib/blend/domain.ts';

test('grouped amounts round trip without losing any token decimals', () => {
  for (const raw of ['1000', '12345678901234567890.123456789012345678', '0.000000000000000001']) {
    assert.equal(readTokenInput(formatTokenInput(raw)), raw);
    assert.equal(parseAmount(readTokenInput(formatTokenInput(raw))), parseAmount(raw));
  }
  assert.equal(formatTokenInput('1000'), '1,000');
});
test('editing preserves empty, trailing decimal and fractional zeroes', () => {
  assert.equal(formatTokenInput(''), '');
  assert.equal(formatTokenInput('1000.'), '1,000.');
  assert.equal(formatTokenInput('1000.0100'), '1,000.0100');
  assert.equal(readTokenInput('.5'), '0.5');
  assert.equal(readTokenInput('00012'), '12');
});
test('invalid amounts are rejected rather than rounded or reinterpreted', () => {
  for (const value of ['-1000', '1e3', '$1000', '1.2.3', '0.1234567890123456789']) assert.equal(readTokenInput(value), undefined);
});
test('caret mapping accounts for grouping while editing in the middle', () => {
  assert.equal(tokenInputCaret('1,234,567.89', 4), 5);
  assert.equal(tokenInputCaret('1,234,567.89', 0), 0);
  assert.equal(tokenInputCaret('1,234,567.89', 10), 12);
});
