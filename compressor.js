'use strict';
const { countTokens } = require('./tokenizer');

// --- Protected span handling ---
const PLACEHOLDER_PREFIX = '\x00NOCOMPRESS';
function extractProtectedSpans(text) {
  const spans = [];
  const result = text.replace(/<no-compress>([\s\S]*?)<\/no-compress>/g, (_, content) => {
    const id = `${PLACEHOLDER_PREFIX}${spans.length}\x00`;
    spans.push(content);
    return id;
  });
  return { text: result, spans };
}
function restoreProtectedSpans(text, spans) {
  return text.replace(new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)\x00`, 'g'), (_, i) => {
    return `<no-compress>${spans[parseInt(i)]}</no-compress>`;
  });
}

// Verbose phrase replacements (order matters — longer first)
const VERBOSE_PHRASES = [
  ['in order to', 'to'],
  ['it is important to note that', 'note:'],
  ['it should be noted that', 'note:'],
  ['please note that', 'note:'],
  ['it is worth noting that', 'note:'],
  ['as a matter of fact', 'in fact'],
  ['due to the fact that', 'because'],
  ['in the event that', 'if'],
  ['in the event of', 'if'],
  ['at the present time', 'now'],
  ['at this point in time', 'now'],
  ['in the near future', 'soon'],
  ['in the process of', 'while'],
  ['with regard to', 'regarding'],
  ['with respect to', 'regarding'],
  ['in relation to', 'regarding'],
  ['in terms of', 'for'],
  ['make use of', 'use'],
  ['take advantage of', 'use'],
  ['in spite of the fact that', 'although'],
  ['despite the fact that', 'although'],
  ['the fact that', ''],
  ['a number of', 'several'],
  ['a large number of', 'many'],
  ['the majority of', 'most'],
  ['on a regular basis', 'regularly'],
  ['in a timely manner', 'promptly'],
  ['has the ability to', 'can'],
  ['is able to', 'can'],
  ['in order for', 'so'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['as well as', 'and'],
  ['in addition to', 'besides'],
  ['in addition,', 'also,'],
  ['furthermore,', 'also,'],
  ['moreover,', 'also,'],
  ['nevertheless,', 'but,'],
  ['notwithstanding', 'despite'],
  ['in conclusion,', 'finally,'],
  ['in summary,', 'in sum,'],
  ['to summarize,', 'in sum,'],
];

// --- Compression strategies ---

function safeCompress(text) {
  let t = text;
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/[ \t]{2,}/g, ' ');
  return t.trim();
}

// Alias for backwards compatibility
const conservativeCompress = safeCompress;

function balancedCompress(text) {
  let t = safeCompress(text);
  for (const [from, to] of VERBOSE_PHRASES) {
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, to);
  }
  t = t.replace(/\.{3,}/g, '...');
  t = t.replace(/!{2,}/g, '!');
  t = t.replace(/\bplease\s+/gi, '');
  return t.trim();
}

function aggressiveCompress(text) {
  let t = balancedCompress(text);
  t = t.replace(/^(sure,?|absolutely,?|of course,?|certainly,?|great,?)\s*/im, '');
  const parts = t.split(/(```[\s\S]*?```)/);
  t = parts.map((part, i) => {
    if (i % 2 === 1) return part; // preserve code blocks
    return part.replace(/([^\n])\n([^\n])/g, '$1 $2');
  }).join('');
  const sentences = t.match(/[^.!?\n]+[.!?]/g) || [];
  const seen = new Set();
  for (const s of sentences) {
    const norm = s.trim().toLowerCase();
    if (seen.has(norm)) t = t.replace(s, '');
    seen.add(norm);
  }
  return t.trim();
}

function segmentText(text) {
  const segments = [];
  const lines = text.split('\n');
  let current = { type: 'paragraph', lines: [] };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (current.lines.length) { segments.push({ ...current, text: current.lines.join('\n') }); current = { type: 'paragraph', lines: [] }; }
      current = { type: current.type === 'code' ? 'paragraph' : 'code', lines: [line] };
    } else if (current.type === 'code') {
      current.lines.push(line);
    } else if (/^#{1,6}\s/.test(line)) {
      if (current.lines.length) { segments.push({ ...current, text: current.lines.join('\n') }); }
      segments.push({ type: 'header', lines: [line], text: line });
      current = { type: 'paragraph', lines: [] };
    } else if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
      if (current.type !== 'list') { if (current.lines.length) segments.push({ ...current, text: current.lines.join('\n') }); current = { type: 'list', lines: [] }; }
      current.lines.push(line);
    } else {
      if (current.type === 'list' && line.trim() !== '') { segments.push({ ...current, text: current.lines.join('\n') }); current = { type: 'paragraph', lines: [] }; }
      current.lines.push(line);
    }
  }
  if (current.lines.length) segments.push({ ...current, text: current.lines.join('\n') });

  return segments.filter(s => s.text.trim()).map(s => ({
    text: s.text,
    type: s.type,
    tokens: countTokens(s.text),
  }));
}

function analyzeSegments(text) {
  const total = countTokens(text);
  const segments = segmentText(text);
  const annotated = segments.map(s => ({
    ...s,
    percentage: total > 0 ? Math.round(s.tokens / total * 100) : 0,
  }));

  const suggestions = [];
  for (const seg of annotated) {
    if (seg.type === 'paragraph' && seg.tokens > 50) {
      const compressed = balancedCompress(seg.text);
      const compTokens = countTokens(compressed);
      if (compTokens < seg.tokens * 0.85) {
        suggestions.push({
          type: seg.type,
          preview: seg.text.slice(0, 60) + '...',
          action: 'compress verbose phrases',
          estimated_savings: seg.tokens - compTokens,
        });
      }
    }
    if (seg.type === 'paragraph' && seg.tokens > 150) {
      suggestions.push({
        type: seg.type,
        preview: seg.text.slice(0, 60) + '...',
        action: 'consider summarizing this long paragraph',
        estimated_savings: Math.round(seg.tokens * 0.4),
      });
    }
  }

  return { total_tokens: total, segments: annotated, suggestions };
}

function compress(text, { strategy = 'balanced', target_ratio } = {}) {
  const { text: stripped, spans } = extractProtectedSpans(text);
  const original_tokens = countTokens(text);
  const safety_warnings = [];
  let compressed;

  const validStrategies = ['safe', 'conservative', 'balanced', 'aggressive'];
  const strat = validStrategies.includes(strategy) ? strategy : 'balanced';

  if (strat === 'safe' || strat === 'conservative') {
    compressed = safeCompress(stripped);
  } else if (strat === 'aggressive') {
    compressed = aggressiveCompress(stripped);
    safety_warnings.push('duplicate sentence removal applied — verify no intentional repetition was removed');
    safety_warnings.push('line merging applied — verify line breaks were not semantically significant');
  } else {
    compressed = balancedCompress(stripped);
  }

  // If target_ratio set and not achieved, escalate
  if (target_ratio && target_ratio < 1) {
    const achieved = countTokens(restoreProtectedSpans(compressed, spans)) / original_tokens;
    if (achieved > target_ratio && strat !== 'aggressive') {
      compressed = aggressiveCompress(stripped);
      if (!safety_warnings.length) {
        safety_warnings.push('escalated to aggressive strategy to meet target_ratio — verify no intentional repetition was removed');
      }
    }
  }

  const final = restoreProtectedSpans(compressed, spans);
  const compressed_tokens = countTokens(final);

  return {
    original_tokens,
    compressed_tokens,
    ratio: original_tokens > 0 ? Math.round((compressed_tokens / original_tokens) * 100) / 100 : 1,
    savings: original_tokens - compressed_tokens,
    strategy: strat,
    safety_warnings,
    compressed_text: final,
  };
}

module.exports = {
  compress, analyzeSegments,
  safeCompress, conservativeCompress, balancedCompress, aggressiveCompress,
};
