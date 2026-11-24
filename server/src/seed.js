import 'dotenv/config';
import { openStore } from './db.js';
import { hashPassword } from './security.js';

const store = await openStore();
const books = [
  ['Arquitecturas de la información', 'Editorial Horizonte', 'Tecnología', 'Una introducción práctica al diseño de sistemas de información.', 'ebook', 1299, 100, '#234d67', 'arquitecturas.txt'],
  ['Datos que cuentan historias', 'Editorial Horizonte', 'Datos', 'Aprende a explorar datos y comunicar hallazgos con claridad.', 'ebook', 1499, 100, '#a34f40', 'datos.txt'],
  ['Diseño centrado en personas', 'Ediciones Ágora', 'Diseño', 'Principios para crear experiencias útiles, inclusivas y comprensibles.', 'ebook', 1199, 100, '#775a92', 'diseno.txt'],
  ['Manual de sistemas distribuidos', 'Ediciones Ágora', 'Tecnología', 'Conceptos de redes, consistencia y escalabilidad con ejemplos.', 'physical', 2499, 12, '#b58b3f', null],
  ['Atlas de ideas digitales', 'Editorial Horizonte', 'Diseño', 'Un recorrido ilustrado por proyectos digitales y sus decisiones.', 'physical', 2199, 8, '#398069', null]
];
const existingBooks = await store.listBooks();
for (const [title, author, category, description, format, priceCents, stock, coverColor, downloadFile] of books) {
  if (!existingBooks.some(book => book.title === title)) await store.saveBook({
    id: store.newId(), title, author, category, description, format, priceCents, stock,
    coverColor, downloadFile, available: true, updatedAt: new Date().toISOString()
  });
}
if (process.env.STAFF_EMAIL && process.env.STAFF_PASSWORD) {
  const email = process.env.STAFF_EMAIL.trim().toLowerCase();
  if (!await store.findUserByEmail(email)) await store.saveUser({ id: store.newId(), name: 'Equipo de gestión', email,
    passwordHash: hashPassword(process.env.STAFF_PASSWORD), role: 'staff', createdAt: new Date().toISOString() });
}
console.log('Catálogo de demostración preparado.');
await store.close();
