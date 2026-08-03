import './globals.css';

export const metadata = {
  title: 'Data Penduduk NIK & Nama',
  description: 'Temukan dan cari data NIK dan nama dengan filter pencarian instan.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
      </body>
    </html>
  );
}
