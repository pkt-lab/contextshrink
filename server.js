'use strict';
const express = require('express');
const { countTokensForModel } = require('./tokenizer');
const { compress, analyzeSegments } = require('./compressor');

const app = express();
app.use(express.json({ limit: '4mb' }));

const MAX_CHARS = 500_000;

// POST /analyze
app.post('/analyze', (req, res) => {
  const { text, model } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text (string) required' });
  if (text.length > MAX_CHARS) return res.status(422).json({ error: `text exceeds ${MAX_CHARS} character limit` });
  const t0 = Date.now();
  try {
    const result = analyzeSegments(text);
    const { count: tokens_before, type: token_count_type } = countTokensForModel(text, model);
    res.json({
      model: model || 'default',
      token_count_type,
      ...result,
      meta: {
        tokens_before,
        processing_time_ms: Date.now() - t0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /compress
app.post('/compress', (req, res) => {
  const { text, strategy, target_ratio, model } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text (string) required' });
  if (text.length > MAX_CHARS) return res.status(422).json({ error: `text exceeds ${MAX_CHARS} character limit` });
  if (target_ratio !== undefined && (typeof target_ratio !== 'number' || target_ratio <= 0 || target_ratio > 1)) {
    return res.status(422).json({ error: 'target_ratio must be a number between 0 (exclusive) and 1 (inclusive)' });
  }
  const validStrategies = ['safe', 'conservative', 'balanced', 'aggressive'];
  const strat = validStrategies.includes(strategy) ? strategy : 'balanced';
  const t0 = Date.now();
  try {
    const result = compress(text, { strategy: strat, target_ratio });
    const { type: token_count_type } = countTokensForModel(text, model);
    res.json({
      model: model || 'default',
      token_count_type,
      ...result,
      meta: {
        tokens_before: result.original_tokens,
        tokens_after: result.compressed_tokens,
        compression_ratio: result.ratio,
        processing_time_ms: Date.now() - t0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /compare
app.post('/compare', (req, res) => {
  const { texts, model } = req.body || {};
  if (!Array.isArray(texts) || texts.length < 2) return res.status(400).json({ error: 'texts array with >= 2 items required' });
  if (!texts.every(t => typeof t === 'string')) return res.status(422).json({ error: 'all items in texts must be strings' });
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  if (totalChars > MAX_CHARS) return res.status(422).json({ error: `total text length exceeds ${MAX_CHARS} character limit` });
  try {
    const results = texts.map((t, i) => {
      const { count, type } = countTokensForModel(t, model);
      return { index: i, preview: t.slice(0, 80) + (t.length > 80 ? '...' : ''), tokens: count, token_count_type: type, chars: t.length };
    });
    const min = Math.min(...results.map(r => r.tokens));
    const max = Math.max(...results.map(r => r.tokens));
    res.json({
      model: model || 'default',
      results,
      diff: { min_tokens: min, max_tokens: max, delta: max - min, delta_pct: max > 0 ? Math.round((max - min) / max * 100) : 0 },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /health
app.get('/health', (req, res) => {
  const pkg = require('./package.json');
  res.json({
    status: 'ok',
    service: 'contextshrink',
    version: pkg.version,
    tokenizer: 'js-tiktoken',
    models_supported: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo', 'claude-*', 'code-davinci-*', 'llama-*', 'mistral-*', 'gemma-*'],
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`ContextShrink listening on :${PORT}`));
