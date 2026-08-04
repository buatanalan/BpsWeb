import crypto from 'crypto';

const SYMMETRIC_ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts data using standard hybrid encryption:
 * 1. Generates a random 256-bit AES key.
 * 2. Encrypts the plaintext data with AES-256-CBC.
 * 3. Encrypts the AES key using the RSA Public Key (with OAEP padding and SHA-256).
 * 4. Combines the encrypted AES key (hex), IV (hex), and ciphertext (hex) separated by ':'.
 * 
 * @param {string} text - Plaintext to encrypt
 * @param {string} publicKeyPem - RSA Public Key in PEM format
 * @returns {string} Combined payload in format "encryptedAesKeyHex:ivHex:ciphertextHex"
 */
export function encryptHybrid(text, publicKeyPem) {
  try {
    // 1. Generate random AES key and IV
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // 2. Encrypt plaintext with AES-256-CBC
    const cipher = crypto.createCipheriv(SYMMETRIC_ALGORITHM, aesKey, iv);
    let encryptedData = cipher.update(text, 'utf8', 'hex');
    encryptedData += cipher.final('hex');

    // 3. Encrypt AES key with RSA Public Key (using standard secure OAEP padding and SHA-256)
    const encryptedAesKey = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    );

    // 4. Combine into final payload: encryptedKey:iv:ciphertext
    return (
      encryptedAesKey.toString('hex') + ':' +
      iv.toString('hex') + ':' +
      encryptedData
    );
  } catch (error) {
    console.error('Hybrid encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypts data using standard hybrid decryption:
 * 1. Splits the payload into encrypted AES key, IV, and ciphertext.
 * 2. Decrypts the AES key using the RSA Private Key.
 * 3. Decrypts the ciphertext using the decrypted AES key and IV.
 * 
 * @param {string} encryptedText - Combined payload "encryptedAesKeyHex:ivHex:ciphertextHex"
 * @param {string} privateKeyPem - RSA Private Key in PEM format
 * @returns {string|null} Decrypted plaintext string or null if decryption fails
 */
export function decryptHybrid(encryptedText, privateKeyPem) {
  try {
    if (!encryptedText || !privateKeyPem) return null;

    const parts = encryptedText.split(':');
    if (parts.length !== 3) return null;

    const encryptedAesKey = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];

    // 1. Decrypt AES key using RSA Private Key
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedAesKey
    );

    // 2. Decrypt ciphertext using decrypted AES key
    const decipher = crypto.createDecipheriv(SYMMETRIC_ALGORITHM, aesKey, iv);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // Decryption failed (e.g. wrong private key, invalid formatting, etc.)
    return null;
  }
}

/**
 * Masks a name by keeping the first letter of each word and replacing the rest with '*'
 * e.g. "Aditya Pratama" -> "A***** P******"
 */
export function maskName(nama) {
  if (!nama) return '';
  return nama
    .split(' ')
    .map(word => {
      if (word.length <= 1) return word;
      if (word.length === 2) return word[0] + '*';
      return word[0] + '*'.repeat(word.length - 1);
    })
    .join(' ');
}

/**
 * Masks numeric/string identifiers like NIK or KK.
 * Keeps the first 6 digits (region code) and last 4 digits, replacing the middle with '*'
 * e.g. "3204011204950001" -> "320401******0001"
 */
export function maskNumber(num) {
  if (!num) return '';
  const str = num.toString().trim();
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
  const str = alamat.trim();
  if (str.length <= 24) {
    return str.slice(0, 6) + '...' + str.slice(-6);
  }
  return str.slice(0, 12) + '...' + str.slice(-12);
}
