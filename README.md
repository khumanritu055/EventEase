# EventEase - College Event Booking System

**Stack:** HTML, CSS, JavaScript, Bootstrap 5, Node.js (Express), **MongoDB** (Mongoose)

## How to run
1. Install Node.js (v18 or newer).
2. Install MongoDB Community Server and start it (default: mongodb://127.0.0.1:27017).
   Or use a free MongoDB Atlas cluster and set its link: `set MONGO_URI=your-atlas-link` (Windows) / `export MONGO_URI=your-atlas-link` (Mac/Linux).
3. In this folder run: `npm install`
4. Start the app: `npm start`
5. Open http://localhost:3000

The database `eventease` and its collections are created automatically on first use.

## Features
- Sign up / log in with two roles: **organizer** and **student** (bcrypt password hashing, session login)
- Organizer: create events (name, venue, date, price, seats), see attendee list with ticket codes, delete events
- Student: browse and search events, filter by category, book 1 to 5 tickets, get a unique ticket code, cancel a booking
- Seats update automatically: booking reduces seats left, cancelling gives them back
- Past events and sold-out events cannot be booked

## MongoDB collections
| Collection | Fields |
|---|---|
| users | name, email (unique), password (hash), role |
| events | organizer (ref users), title, description, category, venue, date, price, totalSeats, seatsLeft |
| bookings | event (ref events), user (ref users), tickets, amount, code, status (booked / cancelled) |

Relationships use ObjectId references, and `populate()` joins them when reading.

## Folder structure
```
EventEase/
  server.js        Express server, Mongoose models, all API routes
  package.json
  public/
    index.html     Single page with Bootstrap modals
    style.css      Custom theme
    app.js         Frontend logic (fetch API calls, rendering)
```

## API routes
| Method | Route | Who |
|---|---|---|
| POST | /api/register, /api/login, /api/logout | everyone |
| GET | /api/me | everyone |
| GET | /api/events?q=&category= | everyone |
| POST | /api/events | organizer |
| DELETE | /api/events/:id | organizer (owner) |
| GET | /api/events/:id/attendees | organizer (owner) |
| POST | /api/events/:id/book | student |
| POST | /api/bookings/:id/cancel | student (owner) |
| GET | /api/dashboard | logged-in user |

## Viva points
- Why MongoDB: flexible JSON-like documents, no fixed table structure, works naturally with JavaScript and Node.js.
- SQL vs MongoDB: tables and rows vs collections and documents; JOIN vs populate(); fixed schema vs flexible schema (Mongoose adds validation).
- Overbooking is prevented with an atomic update: seats are reduced only if `seatsLeft >= tickets`, in one database operation.
- Security: bcrypt hashing, role checks on protected routes, ID validation, regex escaping in search, HTML escaping on the frontend.

## Future scope
Online payment, QR-code tickets, email confirmation, event images, student feedback and ratings.
