import './global.css';

export const metadata = {
  title: 'Excelsia ERP',
  description: 'Plataforma financiera gerencial para empresas chilenas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
