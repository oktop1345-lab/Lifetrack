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

/** Картинка для модели: тип ('image/jpeg') и содержимое в base64 без префикса. */
export interface ChatImage {
  mime: string;
  data: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Картинки к сообщению (нужна модель с поддержкой изображений). */
  images?: ChatImage[];
}
