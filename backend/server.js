require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');

const { testConnection } = require('./config/db');
const { assertEnv } = require('./config/env');
const { sendError, AppError } = require('./utils/response');
const { apiLimiter } = require('./middleware/rateLimit');
const { isSessionCurrent } = require('./middleware/auth');
const { loadRevoked } = require('./utils/sessions');
const liveUpdates = require('./middleware/liveUpdates');

const app = express();
const server = http.createServer(app);

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new AppError(403, 'FORBIDDEN', 'Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Minimal cookie parser (only the refresh cookie is read).
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx > -1) {
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) req.cookies[key] = decodeURIComponent(value);
      }
    }
  }
  next();
});

app.use('/api', apiLimiter);
app.use(liveUpdates);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/menu-categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/outstanding', require('./routes/outstanding'));
app.use('/api/income', require('./routes/income'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/inventory', require('./routes/inventory'));

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});

// 404
app.use((req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Endpoint not found');
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  const code = err.code || 'SERVER_ERROR';
  const message = status >= 500 ? 'Internal server error' : err.message;
  if (status >= 500) console.error(err);
  sendError(res, status, code, message, err.details);
});

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});
app.set('io', io);

// Socket auth: clients must present a valid JWT.
const jwt = require('jsonwebtoken');
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!(await isSessionCurrent(payload))) return next(new Error('Session revoked'));
    socket.user = { id: payload.id, role: payload.role };
    return next();
  } catch {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.join(`role:${socket.user.role}`);
  socket.join(`user:${socket.user.id}`);
  socket.on('disconnect', () => {});
});

// Emit to everyone with a given role, or a specific user.
function emitToRole(role, event, payload) {
  io.to(`role:${role}`).emit(event, payload);
}
function emitToUser(userId, event, payload) {
  io.to(`user:${userId}`).emit(event, payload);
}
app.set('emitToRole', emitToRole);
app.set('emitToUser', emitToUser);

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  try {
    assertEnv();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  try {
    await testConnection();
    console.log('Database connection OK');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
  await loadRevoked();
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
