export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'custom';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  /** Только для своего OpenAI-совместимого endpoint. */
  baseUrl?: string;
}

export interface AiSettings {
  provider: ProviderId;
  configs: Record<ProviderId, ProviderConfig>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
