import { OpenAIRequest } from '../interface.js';
import { logger } from '../logger.js';
import { getConfig } from '../config.js';
import { genUUID } from '../utils.js';

export async function fetchHyperbolic(apiKey: string, data: OpenAIRequest, onMessage?: (message: Record<string, unknown>) => void) {
  const url = getConfig('HYPERBOLIC_URL') || 'https://api.hyperbolic.xyz/v1/chat/completions';

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: data.model || 'deepseek-ai/DeepSeek-V3',
      messages: data.messages,
      temperature: data.temperature || 0.1,
      stream: !!onMessage, // Bật stream nếu có onMessage callback
    }),
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    const error = await res.text();
    logger.error('Hyperbolic API Error:', error);
    throw new Error(`Hyperbolic API error: ${error}`);
  }

  const id = `chatcmpl-${genUUID().replace(/-/g, '')}`;
  const created = Math.floor(Date.now() / 1000);

  // Xử lý streaming response
  if (onMessage) {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Reader not found');
    }

    const decoder = new TextDecoder();
    const chunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onMessage({
          id,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: data.model,
          choices: [{
            index: 0,
            delta: {},
          }],
          finish_reason: 'stop',
        });
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = JSON.parse(line.slice(6));
          const content = jsonData.choices[0].delta.content;
          if (content) {
            onMessage({
              id,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: data.model,
              choices: [{
                index: 0,
                delta: {
                  content,
                },
              }],
              finish_reason: null,
            });
            chunks.push(content);
          }
        }
      }
    }

    return {
      id,
      object: 'chat.completion',
      created,
      model: data.model,
      choices: [{
        index: 0,
        message: {
          content: chunks.join(''),
        },
      }],
    };
  }

  // Xử lý non-streaming response
  const json = await res.json();
  return {
    id,
    object: 'chat.completion',
    created,
    model: data.model,
    choices: [{
      index: 0,
      message: json.choices[0].message,
    }],
  };
}
