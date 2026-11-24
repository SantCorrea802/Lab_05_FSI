'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const money = (c) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD' }).format(c / 100);
const sampleCovers = {
  'Arquitecturas de la información': '/covers/arquitecturas-informacion.webp',
  'Datos que cuentan historias': '/covers/datos-historias.webp',
  'Diseño centrado en personas': '/covers/diseno-personas.webp',
  'Manual de sistemas distribuidos': '/covers/sistemas-distribuidos.webp',
  'Atlas de ideas digitales': '/covers/atlas-ideas.webp'
};
const coverStyle = (book) => ({
  backgroundColor: book.coverColor,
  ...(sampleCovers[book.title] ? { backgroundImage: `linear-gradient(180deg, #06182421 0%, #06182433 50%, #061824a8 100%), url("${sampleCovers[book.title]}")` } : {})
});
const statusLabel = { PENDING_PAYMENT: 'Pendiente de pago', PAID: 'Pagado', PREPARING: 'En preparación', READY: 'Listo', SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' };

export default function Home() {
  const [books, setBooks] = useState([]);
  const [cart, setCart] = useState({});
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('catalog');
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [showAuth, setShowAuth] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [address, setAddress] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [bookForm, setBookForm] = useState({ title: '', author: '', description: '', category: 'Tecnología', format: 'ebook', priceCents: 1000, stock: 10, available: true, coverColor: '#324d73', digitalContent: '' });
  const [editing, setEditing] = useState(null);
  const [tracking, setTracking] = useState({});
  const [pendingOrderId, setPendingOrderId] = useState(null);

  const request = useCallback(async (path, options = {}) => {
    const token = sessionStorage.getItem('libroya_token');
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
    return data;
  }, []);
  const refreshBooks = useCallback(async () => { try { setBooks((await request('/api/books')).books); } catch (e) { setMessage(e.message); } }, [request]);
  const refreshOrders = useCallback(async (user) => {
    if (!user) return;
    try { setOrders((await request(user.role === 'staff' ? '/api/staff/orders' : '/api/orders/me')).orders); }
    catch (e) { setMessage(e.message); }
  }, [request]);
  useEffect(() => {
    setCart(JSON.parse(localStorage.getItem('libroya_cart') || '{}'));
    setPendingOrderId(sessionStorage.getItem('libroya_pending_order'));
    refreshBooks();
    const token = sessionStorage.getItem('libroya_token');
    if (token) request('/api/auth/me').then(d => setSession(d.user)).catch(() => sessionStorage.removeItem('libroya_token'));
  }, [request, refreshBooks]);
  useEffect(() => { localStorage.setItem('libroya_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { if (session) refreshOrders(session); }, [session, refreshOrders]);
  useEffect(() => {
    if (!session) return;
    let ws, retry;
    let stopped = false;
    const connect = () => {
      ws = new WebSocket(`${API.replace(/^http/, 'ws')}/ws`);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: sessionStorage.getItem('libroya_token') }));
      ws.onmessage = (event) => { const data = JSON.parse(event.data); if (data.event === 'connected') setOnline(true); if (data.event?.startsWith('order:')) refreshOrders(session); };
      ws.onclose = () => { setOnline(false); if (!stopped) retry = setTimeout(connect, 2500); };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); ws?.close(); };
  }, [session, refreshOrders]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'cancel') {
      window.history.replaceState({}, '', '/');
      sessionStorage.removeItem('libroya_pending_order');
      setPendingOrderId(null);
      setMessage('Pago cancelado. El pedido sigue pendiente; puedes retomarlo desde Mis pedidos.');
      setTab('orders');
      return;
    }
    const paypalOrderId = params.get('token');
    const orderId = sessionStorage.getItem('libroya_pending_order');
    if (!paypalOrderId || !orderId || !session) return;
    window.history.replaceState({}, '', '/');
    setBusy(true);
    request('/api/payments/paypal/capture', { method: 'POST', body: JSON.stringify({ orderId, paypalOrderId }) })
      .then(() => { sessionStorage.removeItem('libroya_pending_order'); setPendingOrderId(null); sessionStorage.removeItem('libroya_checkout_key'); setCart({}); setTab('orders'); setMessage('Pago confirmado. Tu pedido ya está disponible.'); refreshOrders(session); refreshBooks(); })
      .catch(e => { setMessage(`No se confirmó el pago: ${e.message}. Revisa el pedido antes de reintentar.`); setTab('orders'); })
      .finally(() => setBusy(false));
  }, [session, request, refreshOrders, refreshBooks]);
  const categories = useMemo(() => ['Todos', ...new Set(books.map(b => b.category))], [books]);
  const visibleBooks = books.filter(b => (category === 'Todos' || b.category === category) && `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
  const cartItems = books.filter(b => cart[b.id] > 0).map(b => ({ ...b, quantity: cart[b.id] }));
  const total = cartItems.reduce((n, b) => n + b.priceCents * b.quantity, 0);
  const hasPhysical = cartItems.some(b => b.format === 'physical');
  const changeQuantity = (id, delta) => setCart(prev => {
    sessionStorage.removeItem('libroya_checkout_key');
    const book = books.find(b => b.id === id);
    const value = Math.max(0, Math.min(book?.stock || 0, (prev[id] || 0) + delta));
    return { ...prev, [id]: value };
  });
  const submitAuth = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const data = await request(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify(form) });
      sessionStorage.setItem('libroya_token', data.token);
      setSession(data.user); setShowAuth(false); setForm({ name: '', email: '', password: '' });
      setMessage(`Bienvenido a LibroYa, ${data.user.name}.`);
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const checkout = async () => {
    if (!session) { setShowAuth(true); setMessage('Inicia sesión para continuar.'); return; }
    if (!cartItems.length) return;
    if (hasPhysical && (address.trim().length < 10 || address.trim().length > 300)) {
      setMessage('Ingresa una dirección de entrega de entre 10 y 300 caracteres.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const key = sessionStorage.getItem('libroya_checkout_key') || crypto.randomUUID();
      sessionStorage.setItem('libroya_checkout_key', key);
      const order = (await request('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({
        items: cartItems.map(b => ({ bookId: b.id, quantity: b.quantity })), address
      }) })).order;
      const payment = await request('/api/payments/paypal/order', { method: 'POST', body: JSON.stringify({ orderId: order.id }) });
      if (!payment.approvalUrl) throw new Error('PayPal no devolvió la página de aprobación');
      sessionStorage.setItem('libroya_pending_order', order.id);
      setPendingOrderId(order.id);
      window.location.href = payment.approvalUrl;
    } catch (e) { setMessage(e.message); refreshOrders(session); refreshBooks(); }
    finally { setBusy(false); }
  };
  const cancel = async (order) => {
    try { await request(`/api/orders/${order.id}/cancel`, { method: 'POST' }); sessionStorage.removeItem('libroya_checkout_key'); if (pendingOrderId === order.id) { sessionStorage.removeItem('libroya_pending_order'); setPendingOrderId(null); } setMessage('Pedido cancelado y stock liberado.'); refreshOrders(session); refreshBooks(); }
    catch (e) { setMessage(e.message); }
  };
  const retryCapture = async (order) => {
    setBusy(true); setMessage('');
    try {
      await request('/api/payments/paypal/capture', { method: 'POST', body: JSON.stringify({ orderId: order.id }) });
      sessionStorage.removeItem('libroya_pending_order'); setPendingOrderId(null);
      sessionStorage.removeItem('libroya_checkout_key'); setCart({}); setTab('orders');
      setMessage('Pago confirmado. Tu pedido ya está disponible.'); refreshOrders(session); refreshBooks();
    } catch (e) { setMessage(`No se confirmó el pago: ${e.message}. Revisa el pedido antes de reintentar.`); refreshOrders(session); }
    finally { setBusy(false); }
  };
  const resumePayment = async (order) => {
    setBusy(true);
    try {
      const payment = await request('/api/payments/paypal/order', { method: 'POST', body: JSON.stringify({ orderId: order.id }) });
      if (!payment.approvalUrl) throw new Error('No hay enlace de aprobación disponible');
      sessionStorage.setItem('libroya_pending_order', order.id);
      window.location.href = payment.approvalUrl;
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  const advance = async (order) => {
    const next = { PAID: 'PREPARING', PREPARING: 'READY', READY: 'SHIPPED', SHIPPED: 'DELIVERED' }[order.status];
    if (!next) return;
    try { await request(`/api/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, trackingCode: tracking[order.id] }) }); refreshOrders(session); }
    catch (e) { setMessage(e.message); }
  };
  const saveBook = async (event) => {
    event.preventDefault();
    try {
      await request(editing ? `/api/books/${editing}` : '/api/books', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(editing && !bookForm.digitalContent ? { ...bookForm, digitalContent: undefined } : bookForm) });
      setEditing(null); setBookForm({ title: '', author: '', description: '', category: 'Tecnología', format: 'ebook', priceCents: 1000, stock: 10, available: true, coverColor: '#324d73', digitalContent: '' });
      setMessage('Libro guardado.'); refreshBooks();
    } catch (e) { setMessage(e.message); }
  };
  const logout = () => { sessionStorage.removeItem('libroya_token'); setSession(null); setOrders([]); setTab('catalog'); setMessage('Sesión cerrada.'); };

  return <>
    <header className="site-header"><div className="wrap header-inner"><button className="brand" onClick={() => setTab('catalog')} aria-label="Inicio LibroYa"><span className="brand-mark">L</span><span>Libro<span className="brand-accent">Ya</span></span></button>
      <nav aria-label="Navegación principal"><button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>Catálogo</button><button className={tab === 'orders' ? 'active' : ''} onClick={() => session ? setTab('orders') : setShowAuth(true)}>Mis pedidos</button>{session?.role === 'staff' && <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>Gestión</button>}</nav>
      <div className="header-actions">{session ? <button className="text-button" onClick={logout}>Salir</button> : <button className="text-button" onClick={() => setShowAuth(true)}>Ingresar</button>}<button className="cart-button" onClick={() => setShowCart(true)} aria-label="Abrir carrito">Bolsa <span>{Object.values(cart).reduce((a,b) => a+b, 0)}</span></button></div></div></header>
    {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Cerrar aviso">×</button></div>}
    {tab === 'catalog' && <><section className="hero"><div className="wrap hero-grid"><div><div className="eyebrow">LECTURAS QUE ABREN CAMINOS</div><h1>Una buena idea<br/>empieza en <em>un libro.</em></h1><p>Explora libros digitales para leer hoy y ediciones impresas que llegan a tu puerta.</p><button className="primary" onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })}>Explorar catálogo <span>↗</span></button></div><div className="hero-art" aria-hidden="true"><div className="book book-back" style={{ backgroundImage: 'linear-gradient(180deg, #25100a26, #25100a80), url("/covers/datos-historias.webp")' }}>IDEAS<br/>SIN<br/>LÍMITES</div><div className="book book-front" style={{ backgroundImage: 'linear-gradient(180deg, #06182433, #06182499), url("/covers/arquitecturas-informacion.webp")' }}><small>COLECCIÓN LIBROYA</small><strong>Historias<br/>para el<br/>futuro.</strong><span>✳</span></div></div></div></section>
      <main id="catalogo" className="wrap catalog"><div className="section-heading"><div><div className="eyebrow">CURADURÍA LIBROYA</div><h2>Encuentra tu próxima lectura</h2></div><p>Digitales e impresos, en un solo lugar.</p></div><div className="filters"><div className="chips">{categories.map(c => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar título o autor" aria-label="Buscar libros"/></label></div>
      <div className="book-grid">{visibleBooks.map((b, index) => <article className="book-card" key={b.id}><div className="cover-area" style={{ background: `${b.coverColor}1a` }}><div className="cover" style={coverStyle(b)}><small>LIBROYA · EDICIONES</small><strong>{b.title}</strong><span>✳</span></div><span className="format">{b.format === 'ebook' ? 'DIGITAL' : 'IMPRESO'}</span></div><div className="card-copy"><div className="category">{b.category}</div><h3>{b.title}</h3><p>{b.author}</p><div className="card-bottom"><strong>{money(b.priceCents)}</strong><button disabled={!b.available || b.stock === 0} onClick={() => changeQuantity(b.id, 1)} aria-label={`Agregar ${b.title} al carrito`}>{b.stock ? '+' : 'Agotado'}</button></div><small className="stock">{b.stock ? `${b.stock} disponibles` : 'Agotado'}</small></div></article>)}</div>{!visibleBooks.length && <p className="empty">No encontramos libros con esos filtros.</p>}</main></>}
    {tab === 'orders' && <main className="wrap inner-page"><div className="eyebrow">TU HISTORIAL</div><h1>Mis pedidos</h1><p>Consulta tus compras y accede a tus libros digitales.</p><div className="order-list">{orders.map(o => <article className="order-card" key={o.id}><div className="order-top"><div><small>Pedido #{o.id.slice(0,8)}</small><h2>{statusLabel[o.status]}</h2></div><strong>{money(o.totalCents)}</strong></div><p>{o.items.map(i => `${i.title} × ${i.quantity}`).join(' · ')}</p>{o.trackingCode && <p>Guía de envío: <strong>{o.trackingCode}</strong></p>}<div className="order-actions">{((pendingOrderId === o.id && ['PENDING_PAYMENT','CANCELLED'].includes(o.status)) || o.canVerifyPayment) && <button className="outline" disabled={busy} onClick={() => retryCapture(o)}>Verificar pago</button>}{o.status === 'PENDING_PAYMENT' && <><button className="outline" disabled={busy} onClick={() => resumePayment(o)}>Retomar pago</button><button className="outline" onClick={() => cancel(o)}>Cancelar pedido</button></>}{o.paymentStatus === 'CAPTURED' && o.items.filter(i => i.format === 'ebook').map(i => <a className="outline" key={i.bookId} href={`${API}/api/orders/${o.id}/download/${i.bookId}`} onClick={async e => { e.preventDefault(); try { const response = await fetch(e.currentTarget.href, { headers: { Authorization: `Bearer ${sessionStorage.getItem('libroya_token')}` } }); if (!response.ok) throw Error('No se pudo descargar'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${i.title}.txt`; a.click(); URL.revokeObjectURL(url); } catch(err) { setMessage(err.message); } }}>Descargar {i.title} ↓</a>)}</div></article>)}{!orders.length && <p className="empty">Aún no tienes pedidos.</p>}</div></main>}
    {tab === 'staff' && session?.role === 'staff' && <main className="wrap inner-page"><div className="eyebrow">OPERACIONES</div><h1>Gestión de librería</h1><div className="staff-tabs"><a href="#tablero">Pedidos</a><a href="#inventario">Catálogo y stock</a><span>{online ? '● En vivo' : '○ Reconectando'}</span></div><section id="tablero"><h2>Tablero de pedidos</h2><div className="kanban">{['PAID','PREPARING','READY','SHIPPED','DELIVERED'].map(status => <div className="kanban-column" key={status}><h3>{statusLabel[status]}</h3>{orders.filter(o => o.status === status).map(o => <article key={o.id}><small>#{o.id.slice(0,8)} · {money(o.totalCents)}</small><p>{o.items.map(i => i.title).join(', ')}</p>{o.address && <small>Enviar a: {o.address}</small>}{status === 'READY' && o.items.some(i => i.format === 'physical') && <input placeholder="Guía de envío" value={tracking[o.id] || ''} onChange={e => setTracking({ ...tracking, [o.id]: e.target.value })}/>}<button onClick={() => advance(o)} disabled={status === 'DELIVERED'}>{status === 'DELIVERED' ? 'Finalizado' : 'Avanzar →'}</button></article>)}</div>)}</div></section><section id="inventario" className="inventory"><h2>Catálogo y stock</h2><div className="inventory-grid"><form onSubmit={saveBook} className="panel-form"><h3>{editing ? 'Editar libro' : 'Añadir libro'}</h3>{['title','author','description','category'].map(k => <label key={k}>{({title:'Título',author:'Autor',description:'Descripción',category:'Categoría'})[k]}<input required value={bookForm[k]} onChange={e => setBookForm({ ...bookForm, [k]: e.target.value })}/></label>)}<label>Formato<select value={bookForm.format} onChange={e => setBookForm({ ...bookForm, format: e.target.value })}><option value="ebook">Digital</option><option value="physical">Impreso</option></select></label>{bookForm.format === 'ebook' && <label>Contenido digital (texto UTF-8 para nuevos libros)<textarea value={bookForm.digitalContent || ''} onChange={e => setBookForm({ ...bookForm, digitalContent: e.target.value })} placeholder="Texto del libro de muestra"/></label>}<label>Precio en centavos USD<input type="number" min="1" required value={bookForm.priceCents} onChange={e => setBookForm({ ...bookForm, priceCents: Number(e.target.value) })}/></label><label>Stock<input type="number" min="0" required value={bookForm.stock} onChange={e => setBookForm({ ...bookForm, stock: Number(e.target.value) })}/></label><label>Color de portada<input type="color" value={bookForm.coverColor} onChange={e => setBookForm({ ...bookForm, coverColor: e.target.value })}/></label><label className="check"><input type="checkbox" checked={bookForm.available} onChange={e => setBookForm({ ...bookForm, available: e.target.checked })}/> Disponible</label><button className="primary">Guardar libro</button></form><div className="inventory-list">{books.map(b => <div key={b.id}><div><strong>{b.title}</strong><small>{b.stock} en stock · {money(b.priceCents)} · {b.available ? 'Visible' : 'Oculto'}</small></div><button className="outline" onClick={() => { setEditing(b.id); setBookForm({ ...b }); document.getElementById('inventario')?.scrollIntoView({ behavior: 'smooth' }); }}>Editar</button></div>)}</div></div></section></main>}
    <footer><div className="wrap"><strong>Libro<span>Ya</span></strong><p>Ideas que se quedan contigo.</p><small>Proyecto académico · Compras de prueba con PayPal Sandbox</small></div></footer>
    {showCart && <div className="overlay" onClick={() => setShowCart(false)}><aside className="drawer" onClick={e => e.stopPropagation()} aria-label="Carrito"><div className="drawer-head"><h2>Tu bolsa</h2><button onClick={() => setShowCart(false)} aria-label="Cerrar carrito">×</button></div><div className="drawer-content">{cartItems.map(b => <div className="cart-item" key={b.id}><div className="mini-cover" style={coverStyle(b)}>✳</div><div><strong>{b.title}</strong><small>{b.format === 'ebook' ? 'Digital' : 'Impreso'} · {money(b.priceCents)}</small><div className="qty"><button onClick={() => changeQuantity(b.id, -1)}>−</button><span>{b.quantity}</span><button onClick={() => changeQuantity(b.id, 1)}>+</button></div></div></div>)}{!cartItems.length && <p className="empty">Tu bolsa está vacía.</p>}{hasPhysical && <label className="address">Dirección de entrega<textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle, número, ciudad, país"/></label>}</div><div className="drawer-foot"><div><span>Subtotal</span><strong>{money(total)}</strong></div>{hasPhysical && <div><span>Envío</span><strong>{money(500)}</strong></div>}<div className="grand-total"><span>Total</span><strong>{money(total + (hasPhysical ? 500 : 0))}</strong></div><button className="primary full" disabled={!cartItems.length || busy} onClick={checkout}>{busy ? 'Procesando…' : 'Continuar con PayPal →'}</button><small>El importe se calcula de nuevo en el servidor.</small></div></aside></div>}
    {showAuth && <div className="overlay modal-overlay" onClick={() => setShowAuth(false)}><form className="auth-modal" onSubmit={submitAuth} onClick={e => e.stopPropagation()}><button type="button" className="close" onClick={() => setShowAuth(false)} aria-label="Cerrar">×</button><div className="eyebrow">BIENVENIDO A LIBROYA</div><h2>{authMode === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta'}</h2><p>Guarda tus pedidos y disfruta tus próximas lecturas.</p>{authMode === 'register' && <label>Nombre<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>}<label>Correo electrónico<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label>Contraseña<input type="password" required minLength={authMode === 'register' ? 10 : 1} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/></label><button className="primary full" disabled={busy}>{busy ? 'Espera…' : authMode === 'login' ? 'Ingresar' : 'Crear cuenta'}</button><button type="button" className="switch" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Ingresa'}</button></form></div>}
  </>;
}

