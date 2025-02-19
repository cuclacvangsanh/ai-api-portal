import { calcHex, genUUID } from '../utils.js';
import { getConfig } from '../config.js';
import protobuf from 'protobufjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OpenAIRequest } from '../interface.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const root = protobuf.loadSync(join(__dirname, 'message.proto'));

const defaultChecksum = getConfig('CURSOR_CHECKSUM');

interface CursorUserChatMessage {
  messageId: string;
  role: number;
  content: string;
}

interface CursorChatMessages {
  messages: CursorUserChatMessage[];
  instructions: { instruction: string };
  projectPath: string;
  model: { name: string; empty: string };
  summary: string;
  requestId: string;
  conversationId: string;
}

export async function fetchCursor(cookie: string, data: OpenAIRequest, onMessage?: (message: Record<string, unknown>) => void) {
  const url = getConfig('CURSOR_URL');

  let token = cookie;

  // process cookie for token
  if (cookie.includes('%3A%3A')) {
    token = cookie.split('%3A%3A')[1];
  } else if (cookie.includes('::')) {
    token = cookie.split('::')[1];
  }

  const checksum = genChecksum(cookie);

  const protoBytes = await convertRequest(data);

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/connect+proto',
      'connect-accept-encoding': 'gzip,br',
      'connect-protocol-version': '1',
      'user-agent': 'connect-es/1.4.0',
      'x-cursor-checksum': checksum,
      'x-cursor-client-version': '0.42.3',
      'x-cursor-timezone': 'Asia/Shanghai',
      'host': 'api2.cursor.sh'
    },
    body: protoBytes,
  };

  const res = await fetch(url, options);

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Reader not found');
  }

  const id = `chatcmpl-${genUUID().replace(/-/g, '')}`;
  const created = Math.floor(Date.now() / 1000);

  const chunks: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      onMessage?.({
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
    const msg = bytesToString(value);
    onMessage?.({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [{
        index: 0,
        delta: {
          content: msg,
        },
      }],
      finish_reason: null,
    });
    chunks.push(msg);
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

async function convertRequest(request: OpenAIRequest) {
  const { messages, model, system } = request;
  const formattedMessages = messages.map((message) => {
    let content = '';
    if (Array.isArray(message.content)) {
      content = message.content.map((item) => {
        if (item.text) {
          return item.text;
        }
        if (item.image_url?.url) {
          return `![image](${item.image_url.url})`;
        }
        return '';
      }).join('');
    } else {
      content = message.content;
    }
    return {
      messageId: genUUID(),
      role: message.role === 'user' ? 1 : 2,
      content,
    };
  });

  const cursorMessages: CursorChatMessages = {
    messages: formattedMessages,
    instructions: { instruction: system ?? '' },
    projectPath: '/path/to/project',
    model: { name: model, empty: '' },
    requestId: genUUID(),
    summary: '',
    conversationId: genUUID(),
  };

  const ChatMessage = root.lookupType('cursor.ChatMessage');

  const errMsg = ChatMessage.verify(cursorMessages);
  if (errMsg) {
    throw new Error(errMsg);
  }

  const message = ChatMessage.create(cursorMessages);
  const protoBytes = ChatMessage.encode(message).finish();

  const header = int32ToBytes(0, protoBytes.byteLength);

  const buffer = Buffer.concat([header, protoBytes]);

  const hexString = (buffer.toString('hex')).toUpperCase();

  return Buffer.from(hexString, 'hex');
}

/**
 * 生成checksum, 该key为设备ID, 如果不提供则自动生成一个
 * @param token cookie 网页端登录的WorkosCursorSessionToken
 * @returns 
 */
export function genChecksum(token: string): string {
  let checksum = defaultChecksum;
  if (!checksum) {
    const salt = token.split('.');

    console.log('salt', salt);

    const calc = (data: Buffer) => {
        let t = 165;
        for (let i = 0; i < data.length; i++) {
            data[i] = (data[i] ^ t) + i;
            t = data[i];
        }
    };

    // 获取当前时间并按30分钟取整
    const now = new Date();
    now.setMinutes(30 * Math.floor(now.getMinutes() / 30), 0, 0);
    const timestamp = Math.floor(now.getTime() / 1e6);

  
    const timestampBuffer = Buffer.alloc(6);
    timestampBuffer.writeUInt8((timestamp >> 8) & 0xff, 0);
    timestampBuffer.writeUInt8(timestamp & 0xff, 1);
    timestampBuffer.writeUInt8((timestamp >> 24) & 0xff, 2);
    timestampBuffer.writeUInt8((timestamp >> 16) & 0xff, 3);
    timestampBuffer.writeUInt8((timestamp >> 8) & 0xff, 4);
    timestampBuffer.writeUInt8(timestamp & 0xff, 5);

    calc(timestampBuffer);

    const hex1 = calcHex(salt[1]);
    const hex2 = calcHex(token);
    checksum = `${Buffer.from(timestampBuffer).toString('base64url')}${hex1}/${hex2}`;
  }
  return checksum;
}

function int32ToBytes(magic: number, num: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(num, 0);
  const result = Buffer.concat([Buffer.from([magic]), buffer]);
  return result;
}

/**
 * decode message bytes to string
 */
export function bytesToString(buffer: ArrayBufferLike) {
  const ErrorStartHex = '02000001';
  const hex = Buffer.from(buffer).toString('hex');

  if (hex.startsWith(ErrorStartHex)) {
    const error = decodeErrorBytes(buffer);
    logger.error('Cursor Error message:', error);
    throw new Error(error);
  }
  try {
    let offset = 0;
    const results: string[] = [];

    while (offset < hex.length) {
      if (offset + 10 > hex.length) break;

      const dataLength = parseInt(hex.slice(offset, offset + 10), 16);
      offset += 10;

      if (offset + dataLength * 2 > hex.length) break;

      const messageHex = hex.slice(offset, offset + dataLength * 2);
      offset += dataLength * 2;

      const messageBuffer = Buffer.from(messageHex, 'hex');
      const message = root.lookupType('cursor.ResMessage').decode(messageBuffer) as unknown as { msg: string };
      if (message.msg) results.push(message.msg);
    }
    return results.join('');
  } catch (err: unknown) {
    logger.error('Error decoding message:', err);
    throw err;
  }
}

/**
 * decode error bytes
 */
export function decodeErrorBytes(buffer: ArrayBufferLike) {
  const buf = Buffer.from(buffer.slice(5));
  return buf.toString('utf-8');
}