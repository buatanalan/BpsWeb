const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function seed() {
  const backupJsonPath = path.join(__dirname, '..', 'backup', 'data.json');
  const dbPath = path.join(__dirname, '..', 'data.db');

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

  console.log('Membuat tabel residents...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS residents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      nik TEXT UNIQUE NOT NULL,
      no_kk TEXT NOT NULL,
      alamat_ktp TEXT NOT NULL,
      desil INTEGER NOT NULL
    )
  `);

  console.log('Memasukkan data penduduk...');
  const stmt = await db.prepare(`
    INSERT OR IGNORE INTO residents (nama, nik, no_kk, alamat_ktp, desil)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const res of residents) {
    await stmt.run(res.nama, res.nik, res.no_kk, res.alamat_ktp, res.desil);
    console.log(`Berhasil menambahkan: ${res.nama} (${res.nik})`);
  }

  await stmt.finalize();
  await db.close();
  console.log('Seeding selesai dengan sukses!');
}

seed().catch(err => {
  console.error('Error saat melakukan seeding database:', err);
  process.exit(1);
});
