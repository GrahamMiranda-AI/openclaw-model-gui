const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_PATH = process.env.OPENCLAW_USERS_PATH || path.join(process.env.HOME, '.openclaw', 'model-gui-users.json');
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'change-me-now';

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function ensureUsersFile() {
  if (!fs.existsSync(USERS_PATH)) {
    fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
    const seed = { users: [{ username: 'admin', role: 'admin', passwordHash: hash(PANEL_PASSWORD) }] };
    fs.writeFileSync(USERS_PATH, JSON.stringify(seed, null, 2));
  }
}

function readUsers() {
  ensureUsersFile();
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}

function writeUsers(data) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function authenticate(username, password) {
  const db = readUsers();
  const user = db.users.find((u) => u.username === username);
  if (!user) return null;
  if (user.passwordHash !== hash(password)) return null;
  return { username: user.username, role: user.role };
}

function listUsers() {
  const db = readUsers();
  return db.users.map(({ username, role }) => ({ username, role }));
}

function upsertUser({ username, password, role = 'viewer' }) {
  const db = readUsers();
  const idx = db.users.findIndex((u) => u.username === username);
  const payload = { username, role, passwordHash: hash(password) };
  if (idx >= 0) db.users[idx] = payload; else db.users.push(payload);
  writeUsers(db);
}

function deleteUser(username) {
  const db = readUsers();
  db.users = db.users.filter((u) => u.username !== username);
  if (!db.users.length) throw new Error('Cannot delete last user');
  writeUsers(db);
}

module.exports = { USERS_PATH, authenticate, listUsers, upsertUser, deleteUser };
