'use strict';
const { countTokens } = require('./tokenizer');

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

// Strategies
function conservativeCompress(text) {
  let t = text;
  // Normalize whitespace
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/[ \t]+\n/g, '\n');        // trailing spaces
  t = t.replace(/\n{3,}/g, '\n\n');        // max 2 blank lines
  t = t.replace(/[ \t]{2,}/g, ' ');        // multiple spaces
  return t.trim();
}

function balancedCompress(text) {
  let t = conservativeCompress(text);
  // Apply verbose phrase replacements (case-insensitive)
  for (const [from, to] of VERBOSE_PHRASES) {
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, to);
  }
  // Collapse repeated punctuation
  t = t.replace(/\.{3,}/g, '...');
  t = t.replace(/!{2,}/g, '!');
  // Remove redundant "please" at start of sentences
  t = t.replace(/\bplease\s+/gi, '');
  return t.trim();
}

function aggressiveCompress(text) {
  let t = balancedCompress(text);
  // Remove filler opening phrases
  t = t.replace(/^(sure,?|absolutely,?|of course,?|certainly,?|great,?)\s*/im, '');
  // Collapse newlines in regular paragraphs (not code blocks)
  const parts = t.split(/(```[\s\S]*?```)/);
  t = parts.map((part, i) => {
    if (i % 2 === 1) return part; // code block — don't touch
    return part.replace(/([^\n])\n([^\n])/g, '$1 $2'); // join wrapped lines
  }).join('');
  // Remove duplicate sentences (simple exact match)
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
  // Split into: code blocks, headers, bullets, paragraphs
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

  // Flag high-token low-info segments
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
  const original_tokens = countTokens(text);
  let compressed;

  if (strategy === 'conservative') compressed = conservativeCompress(text);
  else if (strategy === 'aggressive') compressed = aggressiveCompress(text);
  else compressed = balancedCompress(text);

  // If target_ratio set and we haven't hit it, escalate
  if (target_ratio && target_ratio < 1) {
    const compressed_tokens = countTokens(compressed);
    const achieved = compressed_tokens / original_tokens;
    if (achieved > target_ratio && strategy !== 'aggressive') {
      compressed = aggressiveCompress(text);
    }
  }

  const compressed_tokens = countTokens(compressed);
  return {
    original_tokens,
    compressed_tokens,
    ratio: original_tokens > 0 ? Math.round((compressed_tokens / original_tokens) * 100) / 100 : 1,
    savings: original_tokens - compressed_tokens,
    strategy,
    compressed_text: compressed,
  };
}

module.exports = { compress, analyzeSegments, conservativeCompress, balancedCompress, aggressiveCompress };
