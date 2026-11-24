import { randomUUID } from 'node:crypto';

export async function openMongoDatabase(uri) {
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI inválida');
  let mongoose;
  try { ({ default: mongoose } = await import('mongoose')); }
  catch { throw new Error('Falta Mongoose. Ejecute npm install en la raíz del proyecto.'); }
  mongoose.set('transactionAsyncLocalStorage', true);
  const connection = await mongoose.createConnection(uri, { dbName: 'libroya', serverSelectionTimeoutMS: 10000 }).asPromise();
  const opts = { strict: false, versionKey: false, id: false, minimize: false };
  const User = connection.model('User', new mongoose.Schema({ id: { type: String, unique: true }, email: { type: String, unique: true }, name: String,
    passwordHash: String, role: String, createdAt: String }, opts), 'users');
  const Book = connection.model('Book', new mongoose.Schema({ id: { type: String, unique: true }, title: String, author: String, description: String,
    category: String, format: String, priceCents: Number, stock: Number, available: Boolean, coverColor: String,
    digitalContent: String, downloadFile: String, updatedAt: String }, opts), 'books');
  const orderSchema = new mongoose.Schema({ id: { type: String, unique: true }, userId: String, idempotencyKey: String,
    items: [mongoose.Schema.Types.Mixed], address: String, shippingCents: Number, totalCents: Number,
    status: String, paymentStatus: String, createdAt: String, updatedAt: String, expiresAt: String, trackingCode: String }, opts);
  orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
  const Order = connection.model('Order', orderSchema, 'orders');
  const Payment = connection.model('Payment', new mongoose.Schema({ id: { type: String, unique: true }, orderId: { type: String, unique: true },
    providerOrderId: { type: String, unique: true, sparse: true }, captureId: String, provider: String, amountCents: Number,
    currency: String, status: String, createdAt: String, updatedAt: String, approvalUrl: String }, opts), 'payments');
  await Promise.all([User.init(), Book.init(), Order.init(), Payment.init()]);
  const clean = (doc) => {
    if (!doc) return null;
    const { _id, __v, ...value } = doc;
    return value;
  };
  const find = async (model, query) => clean(await model.findOne(query).lean());
  const list = async (model) => (await model.find({}).lean()).map(clean);
  const save = async (model, value) => {
    await model.findOneAndUpdate({ id: value.id }, { $set: value }, { upsert: true, returnDocument: 'after', runValidators: true });
    return value;
  };
  return {
    close: () => connection.close(),
    health: () => connection.readyState === 1,
    getUser: (id) => find(User, { id }),
    findUserByEmail: (email) => find(User, { email }),
    saveUser: (user) => save(User, user),
    getBook: (id) => find(Book, { id }),
    listBooks: () => list(Book),
    saveBook: (book) => save(Book, book),
    getOrder: (id) => find(Order, { id }),
    listOrders: () => list(Order),
    findOrderByKey: (userId, idempotencyKey) => idempotencyKey ? find(Order, { userId, idempotencyKey }) : null,
    saveOrder: (order) => save(Order, order),
    getPaymentByOrder: (orderId) => find(Payment, { orderId }),
    savePayment: (payment) => save(Payment, payment),
    transaction: (fn) => connection.transaction(fn),
    newId: randomUUID
  };
}
