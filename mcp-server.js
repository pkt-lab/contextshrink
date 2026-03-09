#!/usr/bin/env node
'use strict';
// ContextShrink MCP server — stdio JSON-RPC 2.0, MCP spec v2024-11-05
const { compress, analyzeSegments } = require('./compressor');
const { countTokens } = require('./tokenizer');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: null, terminal: false });
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

const TOOLS = [
  {
    name: 'analyze_tokens',
    description: 'Analyze an LLM prompt or text by segment — shows token breakdown per section (headers, code blocks, paragraphs) with compression suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text or prompt to analyze' },
        model: { type: 'string', description: 'Tokenizer model (default: cl100k_base)', enum: ['cl100k_base', 'p50k_base', 'r50k_base'] }
      },
      required: ['text']
    }
  },
  {
    name: 'compress_text',
    description: 'Compress a prompt or document to reduce token count. Returns compressed text with savings report.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to compress' },
        strategy: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'], description: 'Compression strategy (default: balanced)' },
        target_ratio: { type: 'number', description: 'Target compression ratio 0-1 (e.g. 0.7 = 30% reduction)' }
      },
      required: ['text']
    }
  },
  {
    name: 'count_tokens',
    description: 'Count tokens in a text string for a given model.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to count' },
        model: { type: 'string', description: 'Model name (optional, used for display only)' }
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
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'contextshrink', version: '1.0.0' }
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      let content;
      if (name === 'analyze_tokens') {
        const r = analyzeSegments(args.text);
        content = JSON.stringify(r, null, 2);
      } else if (name === 'compress_text') {
        const r = compress(args.text, { strategy: args.strategy, target_ratio: args.target_ratio });
        content = JSON.stringify(r, null, 2);
      } else if (name === 'count_tokens') {
        const n = countTokens(args.text);
        content = JSON.stringify({ tokens: n, model: args.model || 'cl100k_base', text_length: args.text.length });
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
