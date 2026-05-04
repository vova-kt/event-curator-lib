/**
 * OpenAI LLM adapter. See docs/adapters.md.
 */

import OpenAI from 'openai';

/** @type {import('../../core/types.js').LLMUsage} */
const ZERO_USAGE = { inputTokens: 0, outputTokens: 0 };

/**
 * @param {{ apiKey: string, baseURL?: string }} opts
 * @returns {import('../../core/types.js').LLMAdapter}
 */
export function openai({ apiKey, baseURL }) {
  const client = new OpenAI({ apiKey, baseURL });
  return {
    name: 'openai',
    async chat(req) {
      const messages = [
        /** @type {const} */ ({ role: 'system', content: req.system }),
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const maxRetries = req.maxRetries ?? 0;
      const useTools = req.tools && req.tools.length > 0;

      let lastErr;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        /** @type {import('openai').OpenAI.Chat.Completions.ChatCompletion} */
        let resp;
        /** @type {import('../../core/types.js').LLMUsage} */
        let usage;
        try {
          resp = await client.chat.completions.create({
            model: req.model,
            messages,
            temperature: req.temperature,
            max_completion_tokens: req.maxTokens,
            response_format: !useTools && req.json ? { type: 'json_object' } : undefined,
            reasoning_effort: req.reasoningEffort,
            tools: useTools
              ? /** @type {NonNullable<typeof req.tools>} */ (req.tools).map((t) => ({
                  type: /** @type {const} */ ('function'),
                  function: {
                    name: t.name,
                    ...(t.description ? { description: t.description } : {}),
                    parameters: t.inputSchema,
                  },
                }))
              : undefined,
            tool_choice: useTools && req.toolChoice
              ? { type: /** @type {const} */ ('function'), function: { name: req.toolChoice.name } }
              : undefined,
          }, { signal: req.signal });

          usage = resp.usage
            ? { inputTokens: resp.usage.prompt_tokens, outputTokens: resp.usage.completion_tokens }
            : ZERO_USAGE;
        } catch (err) {
          lastErr = err;
          if (attempt < maxRetries) continue;
          break;
        }

        const msg = resp.choices[0]?.message;

        if (useTools && msg?.tool_calls?.length) {
          const toolCalls = msg.tool_calls.map((tc) => ({
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          }));
          return { text: msg.content ?? '', toolCalls, usage };
        }

        const text = msg?.content ?? '';
        if (!req.json) return { text, json: undefined, usage };

        try {
          return { text, json: safeJsonParse(text), usage };
        } catch (err) {
          lastErr = err;
          if (attempt < maxRetries) continue;
          const json = salvageTruncatedJson(text);
          if (json !== undefined) return { text, json, usage };
        }
      }
      throw lastErr;
    },
  };
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    return JSON.parse(stripped);
  }
}

/**
 * Best-effort recovery of truncated JSON (e.g. output hit the token limit).
 * Walks the text tracking brace/bracket depth, finds the last position where a
 * complete value closed, appends the matching closers, and tries to parse.
 *
 * @param {string} text
 * @returns {unknown | undefined}
 */
export function salvageTruncatedJson(text) {
  const stripped = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  if (!stripped) return undefined;

  let lastCompletePos = -1;
  let inString = false;
  let escape = false;
  /** @type {string[]} */
  const stack = [];
  /** @type {string[]} */
  let stackSnapshot = [];

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length >= 1) {
        lastCompletePos = i;
        stackSnapshot = [...stack];
      }
    }
  }

  if (lastCompletePos === -1) return undefined;

  const closing = [...stackSnapshot].reverse().join('');
  try {
    return JSON.parse(stripped.substring(0, lastCompletePos + 1) + closing);
  } catch {
    return undefined;
  }
}
