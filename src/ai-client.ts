import { extractJson } from './prompts';

interface Env {
  AI_API_BASE?: string;
  AI_API_KEY?: string;
  AI_FAST_MODEL?: string;
  AI_EXPERT_API_BASE?: string;
  AI_EXPERT_API_KEY?: string;
  AI_EXPERT_MODEL?: string;
}

export interface ModelConfig {
  model: string;
  apiBase: string;
  apiKey: string;
  maxTokens: number;
}

function getDefaultFastModel(env: Env): { model: string; apiBase: string; apiKey: string } {
  return {
    model: env.AI_FAST_MODEL || 'deepseek-chat',
    apiBase: env.AI_API_BASE || 'https://api.deepseek.com',
    apiKey: env.AI_API_KEY || '',
  };
}

function getDefaultExpertModel(env: Env): { model: string; apiBase: string; apiKey: string } {
  return {
    model: env.AI_EXPERT_MODEL || 'claude-sonnet-4-6',
    apiBase: env.AI_EXPERT_API_BASE || env.AI_API_BASE || 'https://api.deepseek.com',
    apiKey: env.AI_EXPERT_API_KEY || env.AI_API_KEY || '',
  };
}

export function resolveModelConfig(
  env: Env,
  expert: boolean,
  override?: { model?: string; modelApiBase?: string; modelApiKey?: string }
): ModelConfig {
  const defaults = expert ? getDefaultExpertModel(env) : getDefaultFastModel(env);
  return {
    model: override?.model || defaults.model,
    apiBase: override?.modelApiBase || defaults.apiBase,
    apiKey: override?.modelApiKey || defaults.apiKey,
    maxTokens: expert ? 2048 : 2048,
  };
}

export async function callAiAPI(prompt: string, config: ModelConfig): Promise<any> {
  const endpoint = `${config.apiBase.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI API error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    throw new Error('AI returned empty response');
  }
  return extractJson(text);
}
