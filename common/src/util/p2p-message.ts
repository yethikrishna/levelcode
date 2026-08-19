/**
 * Berserk P2P Wave 1: Basic P2P message framing + serialization
 * JSON with 4-byte big-endian length prefix.
 * Target item 31.
 */

export interface P2PMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: number;
}

const HEADER_SIZE = 4;

/** Serialize and frame a message with length prefix. */
export function frameMessage<T>(msg: P2PMessage<T>): Buffer {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Parse framed buffer(s). Returns parsed messages and remaining buffer. */
export function parseFramedMessages(buffer: Buffer): { messages: P2PMessage[]; remaining: Buffer } {
  const messages: P2PMessage[] = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const total = offset + HEADER_SIZE + len;
    if (total > buffer.length) break;

    const body = buffer.subarray(offset + HEADER_SIZE, total);
    try {
      const msg = JSON.parse(body.toString('utf8')) as P2PMessage;
      messages.push(msg);
    } catch {
      // skip invalid
    }
    offset = total;
  }

  const remaining = buffer.subarray(offset);
  return { messages, remaining };
}

export default { frameMessage, parseFramedMessages };