const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const crypto = require('crypto');

/**
 * Computes HMAC-SHA256 hex string in Node.js (matches Web Crypto API computeHmacHex)
 */
function computeHmacHexNode(text, keyBuffer) {
  return crypto
    .createHmac('sha256', keyBuffer)
    .update(text.toLowerCase().trim())
    .digest('hex');
}

/**
 * Safe helper to update or append keys to .env.local without losing other variables
 */
function updateEnvLocal(key, value) {
  const envPath = path.join(__dirname, '..', '.env.local');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
}

async function seed() {
  // Dynamically import the crypto helper (ESM)
  const cryptoHelper = await import('../src/lib/crypto.js');
  const { encryptHybrid } = cryptoHelper;

  const backupJsonPath = path.join(__dirname, '..', 'backup', 'data.json');
  const dbPath = path.join(__dirname, '..', 'data.db');
  const fallbackJsonPath = path.join(__dirname, '..', 'src', 'lib', 'data.json');
  const keysDir = path.join(__dirname, '..', 'keys');
  const privateKeyPath = path.join(keysDir, 'private.pem');
  const publicKeyPath = path.join(keysDir, 'public.pem');

  // 1. Create keys directory if it doesn't exist
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  let publicKeyPem;
  let privateKeyPem;

  // 2. Generate or Load keys
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    console.log('Menghasilkan pasangan kunci RSA 2048 baru...');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
    fs.writeFileSync(publicKeyPath, publicKey, 'utf8');
    publicKeyPem = publicKey;
    privateKeyPem = privateKey;
    console.log('Kunci RSA berhasil dibuat di folder /keys!');
  } else {
    console.log('Memuat kunci RSA yang sudah ada...');
    publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');
    privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
  }

  // Normalize Public Key PEM string to write in .env.local as a single-line base64 key
  const normalizedPubKey = publicKeyPem
    .replace(/-----BEGIN (RSA )?PUBLIC KEY-----/g, '')
    .replace(/-----END (RSA )?PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  updateEnvLocal('NEXT_PUBLIC_RSA_PUBLIC_KEY', normalizedPubKey);

  // Load or generate static HMAC Secret Key in .env.local
  const envPath = path.join(__dirname, '..', '.env.local');
  let hmacSecret = '';
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^NEXT_PUBLIC_HMAC_SECRET_KEY=(.*)$/m);
    if (match) {
      hmacSecret = match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  if (!hmacSecret) {
    hmacSecret = crypto.randomBytes(32).toString('hex');
    updateEnvLocal('NEXT_PUBLIC_HMAC_SECRET_KEY', hmacSecret);
  }

  // Convert the UTF-8 secret key into a buffer for signing (matches TextEncoder.encode on client)
  const hmacKeyBuffer = Buffer.from(hmacSecret, 'utf8');

  if (!fs.existsSync(backupJsonPath)) {
    console.error(`File backup tidak ditemukan di: ${backupJsonPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(backupJsonPath, 'utf8');
  const residents = JSON.parse(rawData);

  console.log('Membuka database SQLite...');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('Menghapus tabel lama jika ada...');
  await db.exec(`DROP TABLE IF EXISTS residents`);

  console.log('Membuat tabel residents dengan kolom terenkripsi dan blind index...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS residents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      nik TEXT NOT NULL,
      no_kk TEXT NOT NULL,
      alamat_ktp TEXT NOT NULL,
      desil TEXT NOT NULL,
      nama_index TEXT NOT NULL,
      nik_index TEXT NOT NULL
    )
  `);

  console.log('Memasukkan data penduduk terenkripsi + blind indexing...');
  const stmt = await db.prepare(`
    INSERT INTO residents (nama, nik, no_kk, alamat_ktp, desil, nama_index, nik_index)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const jsonFallbackData = [];

  for (const res of residents) {
    // Encrypt fields individually using the RSA public key
    const encryptedNama = encryptHybrid(res.nama, publicKeyPem);
    const encryptedNik = encryptHybrid(res.nik, publicKeyPem);
    const encryptedKK = encryptHybrid(res.no_kk, publicKeyPem);
    const encryptedAlamat = encryptHybrid(res.alamat_ktp, publicKeyPem);
    const encryptedDesil = encryptHybrid(res.desil.toString(), publicKeyPem);

    // Compute Blind Index hashes using static HMAC secret key
    const nameWords = res.nama.split(/\s+/);
    const nameIndexHashes = nameWords
      .map(word => computeHmacHexNode(word, hmacKeyBuffer))
      .join(' ');
    
    const nikIndexHash = computeHmacHexNode(res.nik, hmacKeyBuffer);

    // Write to SQLite
    await stmt.run(
      encryptedNama,
      encryptedNik,
      encryptedKK,
      encryptedAlamat,
      encryptedDesil,
      nameIndexHashes,
      nikIndexHash
    );
    console.log(`Berhasil menambahkan (E2EE + Index): [${res.nama.substring(0, 3)}...]`);

    // Add to fallback JSON list
    jsonFallbackData.push({
      id: res.id,
      nama: encryptedNama,
      nik: encryptedNik,
      no_kk: encryptedKK,
      alamat_ktp: encryptedAlamat,
      desil: encryptedDesil,
      nama_index: nameIndexHashes,
      nik_index: nikIndexHash
    });
  }

  await stmt.finalize();
  await db.close();

  console.log('Memperbarui data.json fallback...');
  fs.writeFileSync(fallbackJsonPath, JSON.stringify(jsonFallbackData, null, 2), 'utf8');

  console.log('Seeding selesai dengan sukses!');
}

seed().catch(err => {
  console.error('Error saat melakukan seeding database:', err);
  process.exit(1);
});
