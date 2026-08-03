import { getDbConnection } from '@/lib/db';
import ResidentList from './ResidentList';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Establish server-side SQLite database connection
  const db = await getDbConnection();
  
  // Query all entries from the residents table
  const residents = await db.all('SELECT * FROM residents ORDER BY id ASC');

  return (
    <main className="container">
      <ResidentList initialResidents={residents} />
    </main>
  );
}
