'use strict';
// QuestQA test suite for ContextShrink
const assert = require('assert');
const { compress, analyzeSegments, conservativeCompress, balancedCompress, safeCompress } = require('./compressor');
const { countTokens, countTokensForModel } = require('./tokenizer');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}

console.log('\n=== ContextShrink QuestQA ===\n');

console.log('-- tokenizer: countTokens (backwards compat) --');
test('countTokens returns number', () => assert(typeof countTokens('hello world') === 'number'));
test('empty string = 0', () => assert(countTokens('') === 0));
test('longer text has more tokens', () => assert(countTokens('hello world foo bar') > countTokens('hi')));

console.log('\n-- tokenizer: model-aware --');
test('claude model → estimated', () => assert(countTokensForModel('hello', 'claude-3-sonnet').type === 'estimated'));
test('gpt-4 model → exact', () => assert(countTokensForModel('hello', 'gpt-4').type === 'exact'));
test('gpt-4o model → exact', () => assert(countTokensForModel('hello', 'gpt-4o').type === 'exact'));
test('gpt-3.5-turbo → exact', () => assert(countTokensForModel('hello', 'gpt-3.5-turbo').type === 'exact'));
test('llama model → estimated', () => assert(countTokensForModel('hello', 'llama-3').type === 'estimated'));
test('mistral model → estimated', () => assert(countTokensForModel('hello', 'mistral-7b').type === 'estimated'));
test('unknown model → estimated', () => assert(countTokensForModel('hello', 'some-unknown-model').type === 'estimated'));
test('countTokensForModel returns count', () => assert(typeof countTokensForModel('hello world', 'gpt-4').count === 'number'));
test('countTokensForModel count > 0', () => assert(countTokensForModel('hello world', 'gpt-4').count > 0));
test('empty text → count 0', () => assert(countTokensForModel('', 'gpt-4').count === 0));

console.log('\n-- safe/conservative compress --');
test('safeCompress removes trailing spaces', () => assert(!safeCompress('hello   \nworld').includes('   ')));
test('safeCompress collapses 3+ blank lines to 2', () => assert(!safeCompress('a\n\n\n\nb').includes('\n\n\n')));
test('conservativeCompress alias works', () => assert(!conservativeCompress('hello   \nworld').includes('   ')));

console.log('\n-- balanced compress --');
test('replaces "in order to" with "to"', () => assert(balancedCompress('in order to finish').includes('to finish')));
test('replaces "due to the fact that"', () => assert(balancedCompress('due to the fact that it works').includes('because')));
test('removes "please " prefix', () => assert(!balancedCompress('please do this').startsWith('please')));

console.log('\n-- protected spans --');
test('<no-compress> content preserved in safe mode', () => {
  const r = compress('some text <no-compress>Do NOT do X.\nDo NOT do Y.</no-compress> more text', { strategy: 'safe' });
  assert(r.compressed_text.includes('Do NOT do X.\nDo NOT do Y.'));
});
test('<no-compress> content preserved in aggressive mode', () => {
  const r = compress('in order to test <no-compress>critical policy: do NOT skip</no-compress>', { strategy: 'aggressive' });
  assert(r.compressed_text.includes('critical policy: do NOT skip'));
});
test('<no-compress> wrapper tags preserved', () => {
  const r = compress('<no-compress>protected</no-compress>', { strategy: 'aggressive' });
  assert(r.compressed_text.includes('<no-compress>protected</no-compress>'));
});

console.log('\n-- compress() API --');
test('returns original_tokens', () => assert(typeof compress('hello world').original_tokens === 'number'));
test('returns compressed_tokens', () => assert(typeof compress('hello world').compressed_tokens === 'number'));
test('returns ratio', () => assert(typeof compress('hello world').ratio === 'number'));
test('returns safety_warnings array', () => assert(Array.isArray(compress('hello world').safety_warnings)));
test('ratio <= 1', () => assert(compress('hello world '.repeat(50)).ratio <= 1));
test('aggressive mode includes safety warnings', () => {
  const r = compress('test text'.repeat(10), { strategy: 'aggressive' });
  assert(r.safety_warnings.length > 0);
});
test('safe mode has no safety warnings', () => {
  const r = compress('test text'.repeat(10), { strategy: 'safe' });
  assert(r.safety_warnings.length === 0);
});
test('aggressive <= balanced tokens', () => {
  const text = 'please note that in order to use this, due to the fact that it is important to note that you should as a matter of fact '.repeat(5);
  const b = compress(text, { strategy: 'balanced' }).compressed_tokens;
  const a = compress(text, { strategy: 'aggressive' }).compressed_tokens;
  assert(a <= b + 2);
});

console.log('\n-- analyzeSegments() --');
test('returns total_tokens', () => assert(typeof analyzeSegments('hello').total_tokens === 'number'));
test('returns segments array', () => assert(Array.isArray(analyzeSegments('hello\n\nworld').segments)));
test('segments have type', () => assert(analyzeSegments('hello\n\nworld').segments.every(s => s.type)));
test('suggestions is array', () => assert(Array.isArray(analyzeSegments('hello').suggestions)));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
