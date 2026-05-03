/**
 * Usage-tracking LLM adapter wrapper. Intercepts every `chat()` call and
 * accumulates token counts. The wrapped adapter conforms to `LLMAdapter` —
 * callers don't need to know tracking is active.
 */

/**
 * @typedef {{ totalInput: number, totalOutput: number, calls: number }} UsageStats
 */

/**
 * @param {import('../../core/types.js').LLMAdapter} baseLlm
 * @returns {{ llm: import('../../core/types.js').LLMAdapter, usage: () => UsageStats, reset: () => void }}
 */
export function withTracking(baseLlm) {
  let totalInput = 0;
  let totalOutput = 0;
  let calls = 0;

  return {
    llm: {
      name: baseLlm.name,
      model: baseLlm.model,
      async chat(req) {
        const resp = await baseLlm.chat(req);
        if (resp.usage) {
          totalInput += resp.usage.inputTokens;
          totalOutput += resp.usage.outputTokens;
        }
        calls++;
        return resp;
      },
    },
    usage() {
      return { totalInput, totalOutput, calls };
    },
    reset() {
      totalInput = 0;
      totalOutput = 0;
      calls = 0;
    },
  };
}
