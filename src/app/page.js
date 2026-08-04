import ResidentList from './ResidentList';

export const dynamic = 'force-dynamic';

export default async function Home() {
  return (
    <main className="container">
      <ResidentList initialResidents={[]} />
    </main>
  );
}
