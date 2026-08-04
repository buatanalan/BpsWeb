let db = null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

export async function getDbConnection() {
  // If Supabase environment variables are provided, connect to Supabase
  if (supabaseUrl && supabaseKey) {
    return {
      type: 'supabase',
      queryByHash: async (searchHash) => {
        const cleanUrl = supabaseUrl.trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
        const cleanKey = supabaseKey.trim().replace(/^['"]|['"]$/g, '');

        const cleanHash = searchHash?.trim();

        // Encode HANYA nilai searchHash, bukan struktur or=(...)
        const encodedHash = encodeURIComponent(cleanHash);

        // Jangan encode or=(), koma, atau titik
        const filter = `or=(nama_index.ilike.*${encodedHash}*,nik_index.eq.${encodedHash})`;

        const url = `${cleanUrl}/rest/v1/penduduk?select=id,nama,nik,no_kk,alamat_ktp,desil&${filter}`;

        const response = await fetch(url, {
          headers: {
            'apikey': cleanKey,
            'Authorization': `Bearer ${cleanKey}`,
            'Content-Type': 'application/json'
          },
          next: { revalidate: 0 } // Disable Next.js data cache for real-time fetch
        });
        // Consume the response stream exactly once as text to prevent "Body has already been read" TypeErrors
        let responseText = '';
        try {
          responseText = await response.text();
        } catch (readErr) {
          responseText = response.statusText || 'Gagal membaca response stream.';
        }
        // Handle error responses
        if (!response.ok) {
          let errorDetails = responseText;
          try {
            const errJson = JSON.parse(responseText);
            errorDetails = errJson.message || JSON.stringify(errJson);
          } catch (jsonErr) {
            // Keep raw text if not JSON format
          }
          throw new Error(`Supabase REST query failed with status ${response.status}: ${errorDetails}`);
        }

        // Parse successful responses safely
        try {
          return JSON.parse(responseText);
        } catch (jsonParseErr) {
          throw new Error(`Failed to parse successful Supabase response as JSON: ${responseText.substring(0, 200)}`);
        }
      }
    };
  }

  // Fallback 1: Vercel environment with mock JSON data
  if (process.env.VERCEL) {
    return {
      type: 'mock',
      queryByHash: async (searchHash) => {
        const { default: mockData } = await import('./data.json');
        return mockData.filter(res =>
          res.nama_index.includes(searchHash) || res.nik_index === searchHash
        );
      }
    };
  }

  // Fallback 2: Local SQLite environment
  const sqliteModule = await import('sqlite3');
  const sqlite3 = sqliteModule.default || sqliteModule;
  const { open } = await import('sqlite');
  const path = await import('path');

  if (!db) {
    db = await open({
      filename: path.join(process.cwd(), 'data.db'),
      driver: sqlite3.Database
    });
  }

  return {
    type: 'sqlite',
    queryByHash: async (searchHash) => {
      return await db.all(
        `SELECT id, nama, nik, no_kk, alamat_ktp, desil 
         FROM residents 
         WHERE nama_index LIKE ? OR nik_index = ?`,
        [`%${searchHash}%`, searchHash]
      );
    }
  };
}


