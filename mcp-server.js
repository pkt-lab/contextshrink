#!/usr/bin/env node
'use strict';
// ContextShrink MCP server — stdio JSON-RPC 2.0, MCP spec v2024-11-05
const { compress, analyzeSegments } = require('./compressor');
const { countTokens, countTokensForModel } = require('./tokenizer');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: null, terminal: false });
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

function getArg(args, key, required = true) {
  if (!args || typeof args !== 'object') {
    if (required) throw new Error('Missing arguments object');
    return undefined;
  }
  const val = args[key];
  if (required && val === undefined) throw new Error(`Missing required argument: ${key}`);
  return val;
}

const TOOLS = [
  {
    name: 'analyze_tokens',
    description: 'Analyze an LLM prompt or text by segment — shows token breakdown per section (headers, code blocks, paragraphs) with compression suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text or prompt to analyze' },
        model: { type: 'string', description: 'Model name for tokenization (e.g. gpt-4, claude-3-sonnet, llama-3)' }
      },
      required: ['text']
    }
  },
  {
    name: 'compress_text',
    description: 'Compress a prompt or document to reduce token count. Returns compressed text with savings report and safety warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to compress' },
        strategy: { type: 'string', enum: ['safe', 'balanced', 'aggressive'], description: 'Compression strategy (default: balanced). safe=whitespace only, balanced=verbose phrases, aggressive=full' },
        target_ratio: { type: 'number', description: 'Target compression ratio 0-1 (e.g. 0.7 = 30% reduction)' }
      },
      required: ['text']
    }
  },
  {
    name: 'count_tokens',
    description: 'Count tokens in a text string for a given model. Returns count and whether it is exact or estimated.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to count' },
        model: { type: 'string', description: 'Model name (e.g. gpt-4, claude-3-sonnet, llama-3)' }
      },
      required: ['text']
    }
  }
];

rl.on('line', line => {
  let req;
  try { req = JSON.parse(line.trim()); } catch { return; }
  const { id, method, params } = req;

  if (method === 'initialize') {
    const pkg = require('./package.json');
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'contextshrink', version: pkg.version }
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      let content;
      if (name === 'analyze_tokens') {
        const text = getArg(args, 'text');
        const model = getArg(args, 'model', false);
        if (typeof text !== 'string') throw new Error('text must be a string');
        const r = analyzeSegments(text);
        const { count, type } = countTokensForModel(text, model);
        content = JSON.stringify({ ...r, token_count_type: type, model: model || 'default' }, null, 2);
      } else if (name === 'compress_text') {
        const text = getArg(args, 'text');
        const strategy = getArg(args, 'strategy', false) || 'balanced';
        const target_ratio = getArg(args, 'target_ratio', false);
        if (typeof text !== 'string') throw new Error('text must be a string');
        if (target_ratio !== undefined && (typeof target_ratio !== 'number' || target_ratio <= 0 || target_ratio > 1)) {
          throw new Error('target_ratio must be a number between 0 (exclusive) and 1 (inclusive)');
        }
        const r = compress(text, { strategy, target_ratio });
        content = JSON.stringify(r, null, 2);
      } else if (name === 'count_tokens') {
        const text = getArg(args, 'text');
        const model = getArg(args, 'model', false);
        if (typeof text !== 'string') throw new Error('text must be a string');
        const { count, type } = countTokensForModel(text, model);
        content = JSON.stringify({ tokens: count, token_count_type: type, model: model || 'default', text_length: text.length });
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: content }] } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true } });
    }
  } else if (method === 'notifications/initialized') {
    // no-op
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
});
