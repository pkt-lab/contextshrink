'use strict';
// Token counting with js-tiktoken fallback to char-based estimate
let enc;
try {
  const { get_encoding } = require('js-tiktoken');
  enc = get_encoding('cl100k_base'); // GPT-4 / Claude compatible
} catch {}

function countTokens(text) {
  if (enc) {
    try { return enc.encode(text).length; } catch {}
  }
  // Fallback: roughly 4 chars per token
  return Math.ceil(text.length / 4);
}

function countTokensForModel(text, model) {
  // Claude uses cl100k_base compatible tokenization
  // GPT-4o uses o200k_base but counts are close enough for estimation
  return countTokens(text);
}

module.exports = { countTokens, countTokensForModel };
