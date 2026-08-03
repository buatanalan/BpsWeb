let db = null;

export async function getDbConnection() {
  // If running on Vercel's serverless environment, bypass native SQLite binary dependencies
  if (process.env.VERCEL) {
    return {
      all: async () => {
        const { default: mockData } = await import('./data.json');
        return mockData;
      }
    };
  }

  // Local development: dynamically import sqlite3 and sqlite to keep them out of global bundling
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
  return db;
}
