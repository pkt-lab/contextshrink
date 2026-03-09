'use strict';
const express = require('express');
const { countTokensForModel } = require('./tokenizer');
const { compress, analyzeSegments } = require('./compressor');

const app = express();
app.use(express.json({ limit: '2mb' }));

// POST /analyze
app.post('/analyze', (req, res) => {
  const { text, model } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text (string) required' });
  try {
    const result = analyzeSegments(text);
    res.json({ model: model || 'cl100k_base', ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /compress
app.post('/compress', (req, res) => {
  const { text, strategy, target_ratio, model } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text (string) required' });
  const validStrategies = ['conservative', 'balanced', 'aggressive'];
  const strat = validStrategies.includes(strategy) ? strategy : 'balanced';
  try {
    const result = compress(text, { strategy: strat, target_ratio });
    res.json({ model: model || 'cl100k_base', ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /compare
app.post('/compare', (req, res) => {
  const { texts, model } = req.body || {};
  if (!Array.isArray(texts) || texts.length < 2) return res.status(400).json({ error: 'texts array with >= 2 items required' });
  try {
    const results = texts.map((t, i) => ({
      index: i,
      preview: t.slice(0, 80) + (t.length > 80 ? '...' : ''),
      tokens: countTokensForModel(t, model),
      chars: t.length,
    }));
    const min = Math.min(...results.map(r => r.tokens));
    const max = Math.max(...results.map(r => r.tokens));
    res.json({
      model: model || 'cl100k_base',
      results,
      diff: { min_tokens: min, max_tokens: max, delta: max - min, delta_pct: max > 0 ? Math.round((max - min) / max * 100) : 0 },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'contextshrink', version: '1.0.0' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`ContextShrink listening on :${PORT}`));
