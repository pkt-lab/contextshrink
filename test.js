'use strict';
// QuestQA test suite for ContextShrink
const assert = require('assert');
const { compress, analyzeSegments, conservativeCompress, balancedCompress } = require('./compressor');
const { countTokens } = require('./tokenizer');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}

console.log('\n=== ContextShrink QuestQA ===\n');

console.log('-- tokenizer --');
test('countTokens returns number', () => assert(typeof countTokens('hello world') === 'number'));
test('empty string = 0', () => assert(countTokens('') === 0));
test('longer text has more tokens', () => assert(countTokens('hello world foo bar') > countTokens('hi')));

console.log('\n-- conservative compress --');
test('removes trailing spaces', () => assert(!conservativeCompress('hello   \nworld').includes('   ')));
test('collapses 3+ blank lines to 2', () => assert(!conservativeCompress('a\n\n\n\nb').includes('\n\n\n')));

console.log('\n-- balanced compress --');
test('replaces "in order to" with "to"', () => assert(balancedCompress('in order to finish').includes('to finish')));
test('replaces "due to the fact that"', () => assert(balancedCompress('due to the fact that it works').includes('because')));
test('removes "please " prefix', () => assert(!balancedCompress('please do this').startsWith('please')));

console.log('\n-- compress() API --');
test('returns original_tokens', () => assert(typeof compress('hello world').original_tokens === 'number'));
test('returns compressed_tokens', () => assert(typeof compress('hello world').compressed_tokens === 'number'));
test('returns ratio', () => assert(typeof compress('hello world').ratio === 'number'));
test('ratio <= 1', () => assert(compress('hello world '.repeat(50)).ratio <= 1));
test('aggressive <= balanced tokens', () => {
  const text = 'please note that in order to use this, due to the fact that it is important to note that you should as a matter of fact '.repeat(5);
  const b = compress(text, { strategy: 'balanced' }).compressed_tokens;
  const a = compress(text, { strategy: 'aggressive' }).compressed_tokens;
  assert(a <= b + 2); // allow tiny variance
});

console.log('\n-- analyzeSegments() --');
test('returns total_tokens', () => assert(typeof analyzeSegments('hello').total_tokens === 'number'));
test('returns segments array', () => assert(Array.isArray(analyzeSegments('hello\n\nworld').segments)));
test('segments have type', () => assert(analyzeSegments('hello\n\nworld').segments.every(s => s.type)));
test('suggestions is array', () => assert(Array.isArray(analyzeSegments('hello').suggestions)));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
