// OpenAI 兼容接口的统一客户端。国内主流大模型服务均提供兼容接口。
// API Key 只保存在本机浏览器（默认会话级），不写进代码、不随作品分发。
// 各服务商的地址与模型名称可能更新，以其官方文档为准；浏览器直连是否允许跨域需逐家验证。

import { load, remove, save } from '../core/storage';

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  model: string;
}

export const PRESETS: ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问（阿里云百炼）', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'glm', name: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'moonshot', name: 'Kimi（月之暗面）', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseURL: '', model: '' },
];

export interface ProviderConfig {
  preset: string;
  baseURL: string;
  model: string;
  apiKey: string;
  /** true：保存到本机；false：只在本次会话中保存。 */
  remember: boolean;
}

const KEY = 'ge.llm';

export function loadConfig(): ProviderConfig | null {
  return load<ProviderConfig | null>(KEY, null, true) ?? load<ProviderConfig | null>(KEY, null, false);
}

export function saveConfig(cfg: ProviderConfig | null): void {
  remove(KEY, true);
  remove(KEY, false);
  if (cfg && cfg.apiKey) save(KEY, cfg, !cfg.remember);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ProviderError extends Error {}

export async function chat(cfg: ProviderConfig, messages: ChatMessage[], opts: { json?: boolean; timeoutMs?: number } = {}): Promise<string> {
  if (!cfg.baseURL || !cfg.model || !cfg.apiKey) throw new ProviderError('大模型尚未配置完整。');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(`${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.3,
        stream: false,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderError(`服务返回 ${res.status}：${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError('服务没有返回内容。');
    return text;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if ((e as Error).name === 'AbortError') throw new ProviderError('请求超时。');
    throw new ProviderError('无法连接到服务（可能是网络或跨域限制）。');
  } finally {
    clearTimeout(timer);
  }
}
