/**
 * Generic structured-output helper. Wraps a JSON Schema as a tool definition,
 * forces the LLM to call it, and returns the parsed input. See docs/adapters.md.
 */

/**
 * @template T
 * @typedef {Object} StructuredChatOpts
 * @property {string} model
 * @property {string} system
 * @property {import('./types.js').LLMMessage[]} messages
 * @property {Record<string, unknown>} schema
 * @property {string} [toolName]
 * @property {string} [toolDescription]
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 * @property {number} [maxRetries]
 * @property {'low'|'medium'|'high'} [reasoningEffort]
 * @property {AbortSignal} [signal]
 */

/**
 * @template T
 * @param {import('./types.js').LLMAdapter} llm
 * @param {StructuredChatOpts<T>} opts
 * @returns {Promise<{ data: T, usage: import('./types.js').LLMUsage }>}
 */
export async function structuredChat(llm, opts) {
  const name = opts.toolName ?? 'submit';
  const resp = await llm.chat({
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    tools: [{ name, description: opts.toolDescription, inputSchema: opts.schema }],
    toolChoice: { type: 'tool', name },
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    maxRetries: opts.maxRetries,
    reasoningEffort: opts.reasoningEffort,
    signal: opts.signal,
  });

  const call = resp.toolCalls?.[0];
  if (!call || call.name !== name) {
    throw new Error(`Expected tool call '${name}', got ${call?.name ?? 'none'}`);
  }

  return { data: /** @type {T} */ (call.input), usage: resp.usage };
}
