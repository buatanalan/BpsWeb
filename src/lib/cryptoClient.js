/**
 * Helper internal untuk mendapatkan Web Crypto API secara aman di Browser / Node.js (SSR)
 */
function getCryptoObj() {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
  return null;
}

/**
 * Helper to convert a PEM formatted private key into a binary DER buffer.
 */
function pemToBuffer(pem) {
  if (!pem) return new ArrayBuffer(0);

  // Clean PEM headers/footers (PKCS#8, PKCS#1 RSA, & OpenSSH) along with whitespaces
  const b64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN OPENSSH PRIVATE KEY-----/g, '')
    .replace(/-----END OPENSSH PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  if (!b64) return new ArrayBuffer(0);

  // Decode Base64 to ArrayBuffer in a universal way (Browser & Node.js/SSR)
  if (typeof atob !== 'undefined') {
    const binaryString = atob(b64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } else if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  throw new Error('No Base64 decoder available in this environment.');
}

/**
 * Helper to convert a Hexadecimal string into an ArrayBuffer.
 */
function hexToBuffer(hex) {
  if (!hex || typeof hex !== 'string') return new ArrayBuffer(0);
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0) return new ArrayBuffer(0);

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Decrypts data locally in the browser using the Web Crypto API.
 * 
 * @param {string} encryptedText - Combined payload "encryptedAesKeyHex:ivHex:ciphertextHex"
 * @param {string} privateKeyPem - RSA Private Key PEM string
 * @returns {Promise<string|null>} Decrypted plaintext string or null if decryption fails
 */
export async function decryptHybridClient(encryptedText, privateKeyPem) {
  try {
    if (!encryptedText || !privateKeyPem) return null;

    const cryptoObj = typeof window !== 'undefined'
      ? (window.crypto || window.msCrypto)
      : null;

    if (!cryptoObj || !cryptoObj.subtle) {
      console.warn('Web Crypto API is not available.');
      return null;
    }

    let encryptedAesKeyBuffer, ivBuffer, ciphertextBuffer;

    // KONDISI A: Format dipisah Titik Dua (":")
    if (encryptedText.includes(':')) {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) return null;

      encryptedAesKeyBuffer = hexToBuffer(parts[0]);
      ivBuffer = hexToBuffer(parts[1]);
      ciphertextBuffer = hexToBuffer(parts[2]);
    }
    // KONDISI B: Format Base64 / Binary Gabungan Single String
    else {
      // Decode Base64 ke ArrayBuffer
      const binaryString = atob(encryptedText.trim());
      const rawBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        rawBytes[i] = binaryString.charCodeAt(i);
      }

      // Slicing otomatis berdasarkan RSA 4096-bit (512 bytes) atau 2048-bit (256 bytes)
      // Asumsi RSA 4096 = 512 bytes key, 12 bytes IV
      const rsaKeySizeBytes = 512; // Ubah ke 256 jika memakai RSA 2048
      const ivSizeBytes = 12;

      encryptedAesKeyBuffer = rawBytes.slice(0, rsaKeySizeBytes).buffer;
      ivBuffer = rawBytes.slice(rsaKeySizeBytes, rsaKeySizeBytes + ivSizeBytes).buffer;
      ciphertextBuffer = rawBytes.slice(rsaKeySizeBytes + ivSizeBytes).buffer;
    }

    if (
      encryptedAesKeyBuffer.byteLength === 0 ||
      ivBuffer.byteLength === 0 ||
      ciphertextBuffer.byteLength === 0
    ) {
      return null;
    }

    // 1. Convert PEM Private Key to ArrayBuffer DER format
    const derBuffer = pemToBuffer(privateKeyPem);
    if (derBuffer.byteLength === 0) return null;

    // 2. Import RSA Private Key
    const privateKey = await cryptoObj.subtle.importKey(
      'pkcs8',
      derBuffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      false,
      ['decrypt']
    );

    // 3. Decrypt AES Key using RSA Private Key
    const aesKeyBuffer = await cryptoObj.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedAesKeyBuffer
    );

    // 4. Decrypt AES-GCM
    const aesGcmKey = await cryptoObj.subtle.importKey(
      'raw',
      aesKeyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await cryptoObj.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      aesGcmKey,
      ciphertextBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);

  } catch (error) {
    console.error('Client-side hybrid decryption failed:', error);
    return null;
  }
}

/**
 * Derives a 256-bit symmetric HMAC key buffer from the user's RSA Private Key PEM.
 *
 * @param {string} privateKeyPem - RSA Private Key PEM string
 * @returns {Promise<ArrayBuffer|null>} 32-byte key buffer or null
 */
export async function deriveHmacKey(publicKeyPem) {
  try {
    if (!publicKeyPem) return null;

    const cryptoObj = getCryptoObj();
    if (!cryptoObj || !cryptoObj.subtle) {
      console.warn('Web Crypto API is not available.');
      return null;
    }

    // Normalize PEM by stripping headers, footers, and all whitespace/carriage returns
    const normalizedKey = publicKeyPem
      .replace(/-----BEGIN (RSA )?PUBLIC KEY-----/g, '')
      .replace(/-----END (RSA )?PUBLIC KEY-----/g, '')
      .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
      .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '');

    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedKey);
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
    return hashBuffer;
  } catch (e) {
    console.error('Failed to derive HMAC key:', e);
    return null;
  }
}

/**
 * Menghasilkan Blind Index menggunakan HMAC-SHA256 untuk pencarian O(1).
 * Mengubah teks ke huruf kecil & trim agar pencarian bersifat case-insensitive.
 *
 * @param {any} val - Teks yang akan di-hash
 * @param {string} hmacSecretKey - Kunci rahasia HMAC dalam bentuk string UTF-8
 * @returns {Promise<string|null>} Hex string dari HMAC signature
 */
export async function generateBlindIndex(val, hmacSecretKey) {
  try {
    if (val === null || val === undefined) return null;

    const cryptoObj = getCryptoObj();
    if (!cryptoObj || !cryptoObj.subtle) {
      console.error('Web Crypto API (crypto.subtle) is not supported in this environment.');
      return null;
    }

    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(String(hmacSecretKey));
    const normalizedData = encoder.encode(String(val).trim().toLowerCase());

    const key = await cryptoObj.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await cryptoObj.subtle.sign('HMAC', key, normalizedData);

    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    console.error('Failed to generate blind index:', e);
    return null;
  }
}

/**
 * Masks a name by keeping the first letter of each word and replacing the rest with '*'
 * e.g. "Aditya Pratama" -> "A***** P******"
 */
export function maskName(nama) {
  if (!nama) return '';
  return String(nama)
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 1) return word;
      if (word.length === 2) return word[0] + '*';
      return word[0] + '*'.repeat(word.length - 1);
    })
    .join(' ');
}

/**
 * Masks numeric/string identifiers like NIK.
 * Keeps the first 6 digits (region code) and last 4 digits, replacing the middle with '*'
 * e.g. "3204011204950001" -> "320401******0001"
 */
export function maskNumber(num) {
  if (num === null || num === undefined) return '';
  const str = num.toString().trim();
  if (!str) return '';

  if (str.length <= 2) {
    return str[0] ? str[0] + '*' : str;
  }
  if (str.length <= 10) {
    return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
  }

  const visibleStart = 6;
  const visibleEnd = 4;
  const maskedLength = str.length - visibleStart - visibleEnd;
  return str.slice(0, visibleStart) + '*'.repeat(maskedLength) + str.slice(-visibleEnd);
}

/**
 * Masks residential address by keeping the first 12 characters and last 12 characters.
 * e.g. "Jl. Diponegoro No. 22, RT..." -> "Jl. Diponego...etan, Bandung"
 */
export function maskAlamat(alamat) {
  if (!alamat) return '';
  const str = alamat.toString().trim();
  if (!str) return '';

  if (str.length <= 24) {
    if (str.length <= 6) return str;
    const half = Math.floor(str.length / 2);
    return str.slice(0, half - 1) + '...' + str.slice(half + 1);
  }

  return str.slice(0, 12) + '...' + str.slice(-12);
}
