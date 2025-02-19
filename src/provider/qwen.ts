import { OpenAIRequest } from '../interface.js';
import { logger } from '../logger.js';
import { getConfig } from '../config.js';
import { genUUID } from '../utils.js';

export async function fetchQwen(
  apiKey: string,
  data: OpenAIRequest,
  onMessage?: (message: Record<string, unknown>) => void
) {
  // Lấy URL từ config hoặc dùng mặc định cho Qwen API
  const url = getConfig('QWEN_URL') || 'https://chat.qwenlm.ai/api/chat/completions';

  // Cấu hình body của request: nếu có streaming thì bật stream, đồng thời gán các tham số cho model
  const bodyData = {
    stream: !!onMessage,
    model: 'qwen-max-latest',
    // model: data.model || 'qwen-max-latest',
    messages: data.messages,
    temperature: data.temperature !== undefined ? data.temperature : 0.7,
    max_tokens: data.max_tokens !== undefined ? data.max_tokens : 8192,
    // top_p: data.top_p !== undefined ? data.top_p : 1,
    // frequency_penalty: data.frequency_penalty !== undefined ? data.frequency_penalty : 0,
    // presence_penalty: data.presence_penalty !== undefined ? data.presence_penalty : 0,
  };  

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(bodyData),
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    const error = await res.text();
    logger.error('Qwen API Error:', error);
    throw new Error(`Qwen API error: ${error}`);
  }

  const id = `chatcmpl-${genUUID().replace(/-/g, '')}`;
  const created = Math.floor(Date.now() / 1000);

  // Nếu có callback onMessage thì xử lý streaming
  if (onMessage) {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Reader not found');
    }

    const decoder = new TextDecoder();
    let lastContent = ""; // Lưu lại nội dung đã có

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Gửi thông báo kết thúc stream
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
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        // Loại bỏ prefix "data: " nếu có
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          // Nếu gặp tín hiệu kết thúc stream từ server (ví dụ "[DONE]")
          if (jsonStr === '[DONE]') {
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
          try {
            const jsonData = JSON.parse(jsonStr);
            // Với API của Qwen, dữ liệu trả về dạng: { choices: [ { delta: { role, content } } ] }
            const delta = jsonData.choices[0].delta;
            const newContent = delta.content;
            if (newContent !== undefined) {
              // Nếu newContent là toàn bộ nội dung đã có,
              // chỉ lấy phần chênh lệch (mới) so với lastContent
              let diff = "";
              if (newContent.startsWith(lastContent)) {
                diff = newContent.slice(lastContent.length);
              } else {
                // Nếu không khớp, dùng toàn bộ newContent (dự phòng)
                diff = newContent;
              }
              if (diff) {
                // Tách diff thành từng ký tự và gửi từng ký tự một
                for (const char of diff.split('')) {
                  onMessage({
                    id,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: data.model,
                    choices: [{
                      index: 0,
                      delta: { content: char },
                    }],
                    finish_reason: null,
                  });
                  // // Delay 0.5ms giữa các ký tự để tránh gửi quá nhanh
                  // await new Promise((resolve) => setTimeout(resolve, 0.5));
                }
              }
              // Cập nhật lastContent với newContent nhận được
              lastContent = newContent;
            }
          } catch (err) {
            // logger.error('Error parsing Qwen stream data:', err);
          }
        }
      }
    }

    // Sau khi stream kết thúc, trả về object hoàn chỉnh với nội dung cuối cùng
    return {
      id,
      object: 'chat.completion',
      created,
      model: data.model,
      choices: [{
        index: 0,
        message: {
          content: lastContent,
        },
      }],
    };
  }

  // Xử lý response non-streaming
  const json = await res.json();
  const messageContent = json.choices[0].delta?.content || '';
  return {
    id,
    object: 'chat.completion',
    created,
    model: data.model,
    choices: [{
      index: 0,
      message: {
        content: messageContent,
      },
    }],
  };
}
