const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

// ---------- Database (MongoDB) ----------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['organizer', 'student'], required: true }
}));

const Event = mongoose.model('Event', new mongoose.Schema({
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  venue: { type: String, required: true },
  date: { type: Date, required: true },
  price: { type: Number, default: 0, min: 0 },
  totalSeats: { type: Number, required: true, min: 1 },
  seatsLeft: { type: Number, required: true, min: 0 }
}, { timestamps: true }));

const Booking = mongoose.model('Booking', new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tickets: { type: Number, required: true, min: 1, max: 5 },
  amount: { type: Number, required: true },
  code: { type: String, required: true },
  status: { type: String, enum: ['booked', 'cancelled'], default: 'booked' }
}, { timestamps: true }));

// ---------- App setup ----------
const app = express();
app.use(express.json());
app.use(session({ secret: 'eventease-secret-change-me', resave: false, saveUninitialized: false }));
app.use(express.static(path.join(__dirname, 'public')));

const need = role => (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  if (role && req.session.user.role !== role) return res.status(403).json({ error: `Only an ${role} can do this.` });
  next();
};
const wrap = fn => (req, res) => fn(req, res).catch(e => res.status(400).json({ error: e.message || 'Something went wrong.' }));
const validId = id => mongoose.isValidObjectId(id);

// ---------- Auth ----------
app.post('/api/register', wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !['organizer', 'student'].includes(role)) throw new Error('Fill in all fields.');
  if (password.length < 6) throw new Error('Password needs at least 6 characters.');
  if (await User.findOne({ email: email.toLowerCase().trim() })) throw new Error('This email is already registered.');
  const u = await User.create({ name, email, password: bcrypt.hashSync(password, 10), role });
  req.session.user = { id: u._id, name: u.name, role: u.role };
  res.json(req.session.user);
}));

app.post('/api/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: (req.body.email || '').toLowerCase().trim() });
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) return res.status(401).json({ error: 'Wrong email or password.' });
  req.session.user = { id: u._id, name: u.name, role: u.role };
  res.json(req.session.user);
}));

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json(req.session.user || null));

// ---------- Events ----------
app.get('/api/events', wrap(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) {
    const rx = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { venue: rx }];
  }
  res.json(await Event.find(filter).populate('organizer', 'name').sort({ date: 1 }));
}));

app.post('/api/events', need('organizer'), wrap(async (req, res) => {
  const { title, description, category, venue, date, price, totalSeats } = req.body;
  if (!title || !description || !category || !venue || !date || !(totalSeats > 0)) throw new Error('Fill in all fields with valid seats.');
  if (new Date(date) < new Date()) throw new Error('Event date must be in the future.');
  const ev = await Event.create({ organizer: req.session.user.id, title, description, category, venue, date,
    price: Number(price) || 0, totalSeats, seatsLeft: totalSeats });
  res.json(ev);
}));

app.delete('/api/events/:id', need('organizer'), wrap(async (req, res) => {
  if (!validId(req.params.id)) throw new Error('Invalid event.');
  const ev = await Event.findOneAndDelete({ _id: req.params.id, organizer: req.session.user.id });
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  await Booking.deleteMany({ event: ev._id });
  res.json({ ok: true });
}));

app.get('/api/events/:id/attendees', need('organizer'), wrap(async (req, res) => {
  if (!validId(req.params.id)) throw new Error('Invalid event.');
  const ev = await Event.findOne({ _id: req.params.id, organizer: req.session.user.id });
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  res.json(await Booking.find({ event: ev._id, status: 'booked' }).populate('user', 'name email').sort({ createdAt: -1 }));
}));

// ---------- Bookings ----------
app.post('/api/events/:id/book', need('student'), wrap(async (req, res) => {
  const tickets = Number(req.body.tickets);
  if (!validId(req.params.id)) throw new Error('Invalid event.');
  if (!(tickets >= 1 && tickets <= 5)) throw new Error('You can book 1 to 5 tickets.');
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  if (ev.date < new Date()) throw new Error('This event has already happened.');
  // Atomic seat reservation: only succeeds if enough seats are left
  const updated = await Event.findOneAndUpdate({ _id: ev._id, seatsLeft: { $gte: tickets } }, { $inc: { seatsLeft: -tickets } });
  if (!updated) throw new Error('Not enough seats left.');
  try {
    const b = await Booking.create({ event: ev._id, user: req.session.user.id, tickets, amount: ev.price * tickets,
      code: crypto.randomBytes(4).toString('hex').toUpperCase() });
    res.json(b);
  } catch (e) {
    await Event.updateOne({ _id: ev._id }, { $inc: { seatsLeft: tickets } }); // give seats back if booking failed
    throw e;
  }
}));

app.post('/api/bookings/:id/cancel', need('student'), wrap(async (req, res) => {
  if (!validId(req.params.id)) throw new Error('Invalid booking.');
  const b = await Booking.findOneAndUpdate({ _id: req.params.id, user: req.session.user.id, status: 'booked' }, { status: 'cancelled' });
  if (!b) return res.status(404).json({ error: 'Booking not found or already cancelled.' });
  await Event.updateOne({ _id: b.event }, { $inc: { seatsLeft: b.tickets } });
  res.json({ ok: true });
}));

// ---------- Dashboard ----------
app.get('/api/dashboard', need(), wrap(async (req, res) => {
  const u = req.session.user;
  if (u.role === 'organizer') {
    const events = await Event.find({ organizer: u.id }).sort({ date: 1 }).lean();
    return res.json(events.map(e => ({ ...e, booked: e.totalSeats - e.seatsLeft })));
  }
  res.json(await Booking.find({ user: u.id }).populate('event', 'title venue date').sort({ createdAt: -1 }));
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EventEase running at http://localhost:${PORT}`));
