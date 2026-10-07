let me = null, authMode = 'login', EVENTS = {};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
const alertHtml = (m, t = 'danger') => `<div class="alert alert-${t} py-2">${esc(m)}</div>`;
const fmt = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function flash(m, t = 'success') { window.scrollTo({ top: 0, behavior: 'smooth' }); $('alertBox').innerHTML = alertHtml(m, t); setTimeout(() => $('alertBox').innerHTML = '', 3500); }

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function renderNav() {
  const org = me && me.role === 'organizer';
  $('navRight').innerHTML = me
    ? `<span class="text-white-50 d-none d-md-inline">Hi, ${esc(me.name)} (${me.role})</span>
       ${org ? '<button class="btn btn-sm btn-ee" onclick="showView(\'create\')">Create event</button>' : ''}
       <button class="btn btn-sm btn-outline-light" onclick="showView('dash')">${org ? 'My events' : 'My tickets'}</button>
       <button class="btn btn-sm btn-outline-light" onclick="logout()">Log out</button>`
    : `<button class="btn btn-sm btn-outline-light" onclick="openAuth('login')">Log in</button>
       <button class="btn btn-sm btn-ee" onclick="openAuth('register')">Sign up</button>`;
}

function showView(v) {
  if ((v === 'dash' || v === 'create') && !me) return openAuth('login');
  ['browse', 'dash', 'create'].forEach(x => $('view-' + x).classList.toggle('d-none', x !== v));
  if (v === 'browse') loadEvents();
  if (v === 'dash') loadDash();
}

// ---------- Auth ----------
function openAuth(m) { authMode = m; applyAuth(); $('authAlert').innerHTML = ''; modal('authModal').show(); }
function toggleAuth() { authMode = authMode === 'login' ? 'register' : 'login'; applyAuth(); }
function applyAuth() {
  const reg = authMode === 'register';
  $('regOnly').classList.toggle('d-none', !reg);
  $('authTitle').textContent = $('authBtn').textContent = reg ? 'Create account' : 'Log in';
  $('authSwitch').textContent = reg ? 'Already have an account? Log in' : 'New here? Create an account';
}
async function submitAuth() {
  try {
    const body = { email: $('a_email').value, password: $('a_pass').value };
    if (authMode === 'register') Object.assign(body, { name: $('a_name').value, role: $('a_role').value });
    me = await api('/api/' + authMode, 'POST', body);
    modal('authModal').hide(); renderNav(); showView('browse'); flash(`Welcome, ${me.name}!`);
  } catch (e) { $('authAlert').innerHTML = alertHtml(e.message); }
}
async function logout() { await api('/api/logout', 'POST'); me = null; renderNav(); showView('browse'); }

// ---------- Events ----------
async function loadEvents() {
  const list = await api(`/api/events?q=${encodeURIComponent($('q').value)}&category=${encodeURIComponent($('cat').value)}`);
  EVENTS = Object.fromEntries(list.map(e => [e._id, e]));
  $('eventList').innerHTML = list.length ? list.map(e => {
    const d = new Date(e.date), past = d < new Date(), full = e.seatsLeft === 0;
    return `<div class="col-md-6"><div class="card ee-card h-100"><div class="card-body d-flex gap-3">
      <div class="ee-date"><b>${d.getDate()}</b>${d.toLocaleString('en-IN', { month: 'short' })}</div>
      <div class="flex-grow-1 d-flex flex-column">
        <h5 class="mb-1">${esc(e.title)}</h5>
        <div class="text-muted small mb-2">${esc(e.category)} - ${esc(e.venue)} - ${fmt(e.date)}</div>
        <p class="flex-grow-1 mb-2">${esc(e.description)}</p>
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div><span class="price">${e.price ? 'Rs. ' + e.price : 'Free'}</span>
            ${full ? '<span class="badge badge-soldout ms-2">Sold out</span>' : `<span class="badge badge-seats ms-2">${e.seatsLeft} of ${e.totalSeats} seats left</span>`}</div>
          ${me && me.role === 'student' && !past && !full ? `<button class="btn btn-sm btn-ee" onclick="openBook('${e._id}')">Book tickets</button>` : ''}
          ${past ? '<span class="text-muted small">Event over</span>' : ''}
        </div>
      </div></div></div></div>`;
  }).join('') : '<div class="col-12"><div class="alert alert-light border">No events found. Try a different word or category.</div></div>';
}

async function submitEvent() {
  $('createAlert').innerHTML = '';
  if (!$('e_date').value) return $('createAlert').innerHTML = alertHtml('Pick both the date and the time of the event.');
  try {
    await api('/api/events', 'POST', { title: $('e_title').value, description: $('e_desc').value, category: $('e_cat').value,
      venue: $('e_venue').value, date: $('e_date').value, price: Number($('e_price').value), totalSeats: Number($('e_seats').value) });
    ['e_title', 'e_desc', 'e_venue', 'e_date', 'e_seats'].forEach(i => $(i).value = '');
    showView('dash'); flash('Event created.');
  } catch (e) { $('createAlert').innerHTML = alertHtml(e.message); }
}

// ---------- Booking ----------
function openBook(id) {
  const e = EVENTS[id];
  $('b_event').value = id; $('b_price').value = e.price; $('b_name').textContent = e.title;
  $('b_tickets').value = 1; $('bookAlert').innerHTML = ''; updateTotal(); modal('bookModal').show();
}
function updateTotal() {
  const t = Number($('b_tickets').value) * Number($('b_price').value);
  $('b_total').textContent = t ? 'Rs. ' + t : 'Free';
}
async function bookNow() {
  try {
    const b = await api(`/api/events/${$('b_event').value}/book`, 'POST', { tickets: Number($('b_tickets').value) });
    modal('bookModal').hide(); loadEvents(); flash(`Booked! Your ticket code is ${b.code}`);
  } catch (e) { $('bookAlert').innerHTML = alertHtml(e.message); }
}
async function cancelBooking(id) {
  if (!confirm('Cancel this booking? Your seats will be released.')) return;
  try { await api(`/api/bookings/${id}/cancel`, 'POST'); loadDash(); flash('Booking cancelled.'); }
  catch (e) { flash(e.message, 'danger'); }
}

// ---------- Organizer ----------
async function viewAttendees(id) {
  const list = await api(`/api/events/${id}/attendees`);
  $('listBody').innerHTML = list.length ? `<table class="table align-middle"><thead><tr><th>Name</th><th>Email</th><th>Tickets</th><th>Code</th></tr></thead><tbody>${
    list.map(b => `<tr><td>${esc(b.user.name)}</td><td>${esc(b.user.email)}</td><td>${b.tickets}</td><td><span class="ticket-code">${esc(b.code)}</span></td></tr>`).join('')}</tbody></table>`
    : '<p class="mb-0">No bookings yet. Attendees will appear here once students book.</p>';
  modal('listModal').show();
}
async function delEvent(id) {
  if (!confirm('Delete this event and all its bookings?')) return;
  await api('/api/events/' + id, 'DELETE'); loadDash();
}

// ---------- Dashboard ----------
async function loadDash() {
  const rows = await api('/api/dashboard'), org = me.role === 'organizer';
  $('view-dash').innerHTML = `<h4 class="mb-3">${org ? 'My events' : 'My tickets'}</h4>` + (rows.length ? rows.map(r => org ? `
    <div class="card ee-card mb-2"><div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div><strong>${esc(r.title)}</strong><div class="text-muted small">${fmt(r.date)} - ${esc(r.venue)} - ${r.booked} of ${r.totalSeats} seats booked</div></div>
      <div class="d-flex gap-2"><button class="btn btn-sm btn-ee" onclick="viewAttendees('${r._id}')">View attendees</button>
        <button class="btn btn-sm btn-outline-danger" onclick="delEvent('${r._id}')">Delete</button></div>
    </div></div>` : `
    <div class="card ee-card mb-2"><div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div><strong>${r.event ? esc(r.event.title) : 'Event removed'}</strong> <span class="badge badge-${r.status}">${r.status}</span>
        <div class="text-muted small">${r.event ? fmt(r.event.date) + ' - ' + esc(r.event.venue) : ''}</div>
        <div class="small">${r.tickets} ticket(s) - ${r.amount ? 'Rs. ' + r.amount : 'Free'} - Code: <span class="ticket-code">${esc(r.code)}</span></div></div>
      ${r.status === 'booked' ? `<button class="btn btn-sm btn-outline-danger" onclick="cancelBooking('${r._id}')">Cancel booking</button>` : ''}
    </div></div>`).join('')
    : `<div class="alert alert-light border">${org ? 'You have not created any events yet.' : 'You have not booked any tickets yet. Browse events and book your seats.'}</div>`);
}

(async () => { me = await api('/api/me'); renderNav(); loadEvents(); })();
