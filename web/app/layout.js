import './globals.css';

export const metadata = { title: 'LibroYa | Libros para nuevas ideas', description: 'Tienda de libros digitales e impresos' };
export default function RootLayout({ children }) {
  return <html lang="es"><body>{children}</body></html>;
}
