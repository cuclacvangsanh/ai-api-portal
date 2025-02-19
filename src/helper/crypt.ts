import { Buffer } from 'buffer';
import { getConfig } from '../config.js';
// Secret key
const ENCRYPT_KEY = Buffer.from(getConfig('ENCRYPT_KEY'));

// Conversion table for base62 encoding
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function decompressUUID(compressed: string): string {
    let num = BigInt(0);
    for (const char of compressed) {
        num = num * BigInt(62) + BigInt(BASE62_CHARS.indexOf(char));
    }
    // Convert the number back to bytes (16 bytes for UUID)
    const encryptedBytes = num.toString(16).padStart(32, '0');
    const uuidBytes = rc4Crypt(Buffer.from(encryptedBytes, 'hex'), ENCRYPT_KEY);
    const hexStr = uuidBytes.toString('hex');
    return `${hexStr.slice(0, 8)}-${hexStr.slice(8, 12)}-${hexStr.slice(12, 16)}-${hexStr.slice(16, 20)}-${hexStr.slice(20)}`;
}

function rc4Crypt(data: Buffer, key: Buffer): Buffer {
    // Perform RC4 encryption/decryption on the data with the given key
    let S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + key[i % key.length]) % 256;
        [S[i], S[j]] = [S[j], S[i]];
    }

    let i = 0, k;
    const result = Buffer.alloc(data.length);
    for (let a = 0; a < data.length; a++) {
        i = (i + 1) % 256;
        j = (j + S[i]) % 256;
        [S[i], S[j]] = [S[j], S[i]];
        k = S[(S[i] + S[j]) % 256];
        result[a] = data[a] ^ k;
    }
    return result;
}

export function decodeToken(token: string): any {
    try {
        // Add padding if necessary
        const padding = 4 - (token.length % 4);
        if (padding !== 4) {
            token += '='.repeat(padding);
        }

        const encrypted = Buffer.from(token, 'base64url');
        const decrypted = rc4Crypt(encrypted, ENCRYPT_KEY);
        const payload = JSON.parse(decrypted.toString());

        // Decompress UUID from the encoded string
        const userUUID = decompressUUID(payload['u']);

        const planTypeMap = {'p': 'paid', 'f': 'trial'};
        return {
            'user_uuid': userUUID,
            'plan_type': planTypeMap[payload['p'] as keyof typeof planTypeMap] || payload['p'],
            'exp': payload['e'],
        };
    } catch (e) {
        if (e instanceof Error) {
            console.error(`Error decoding token: ${e.message}`);
        } else {
            console.error(`Error decoding token: ${String(e)}`);
        }
        return null;
    }
}





// const userUUID = "34f628bb-8f57-46ee-8e70-8a6b30d6c650";
// const planType = "paid";

// console.log("=== Create Token ===");
// const token = createToken(userUUID, planType);
// console.log("Ultra Short Token:", token);
// console.log("Token length:", token.length);




// console.log("\n=== Decode Token ===");
// const decodedData = decodeToken(token);
// console.log("Decoded data:", JSON.stringify(decodedData, null, 2));