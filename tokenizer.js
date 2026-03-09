'use strict';
// Model-aware token counting with js-tiktoken

const _encoders = {};

function _getEncoder(name) {
  if (_encoders[name]) return _encoders[name];
  try {
    const { get_encoding } = require('js-tiktoken');
    _encoders[name] = get_encoding(name);
    return _encoders[name];
  } catch {
    return null;
  }
}

// Pre-initialize cl100k_base
_getEncoder('cl100k_base');

function _getModelInfo(model) {
  if (!model) return { encoding: 'cl100k_base', type: 'estimated' };
  const m = model.toLowerCase();

  if (m.startsWith('claude'))                                        return { encoding: 'cl100k_base', type: 'estimated' };
  if (m === 'gpt-4' || m.startsWith('gpt-4o') || m === 'gpt-4-turbo' ||
      m === 'text-embedding-ada-002' || m === 'text-embedding-3-small' ||
      m === 'text-embedding-3-large')                                return { encoding: 'cl100k_base', type: 'exact' };
  if (m.startsWith('gpt-3.5'))                                       return { encoding: 'cl100k_base', type: 'exact' };
  if (m.startsWith('gpt-5'))                                         return { encoding: 'o200k_base',  type: 'estimated' };
  if (m.startsWith('code-davinci') || m === 'text-davinci-002')      return { encoding: 'p50k_base',   type: 'exact' };
  if (m.startsWith('llama') || m.startsWith('mistral') ||
      m.startsWith('gemma') || m.startsWith('qwen'))                 return { encoding: null,          type: 'estimated' };

  return { encoding: 'cl100k_base', type: 'estimated' };
}

function _encodeWith(text, encodingName) {
  if (!encodingName) return Math.ceil(text.length / 3.5);
  const enc = _getEncoder(encodingName);
  if (!enc) return Math.ceil(text.length / 4);
  try { return enc.encode(text).length; } catch { return Math.ceil(text.length / 4); }
}

/** Returns raw token count (number). Uses cl100k_base. */
function countTokens(text) {
  if (!text) return 0;
  return _encodeWith(text, 'cl100k_base');
}

/** Returns { count, type } where type is "exact" or "estimated". */
function countTokensForModel(text, model) {
  if (!text) return { count: 0, type: 'exact' };
  const { encoding, type } = _getModelInfo(model);
  const effectiveEncoding = (encoding && _getEncoder(encoding)) ? encoding : 'cl100k_base';
  const effectiveType = effectiveEncoding !== encoding ? 'estimated' : type;
  return { count: _encodeWith(text, effectiveEncoding), type: effectiveType };
}

module.exports = { countTokens, countTokensForModel };
