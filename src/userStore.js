const fs = require("fs");
const path = require("path");
const { USERS_FILE } = require("./config");

let users = {};

function loadUsers() {
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch { users = {}; }
}
function saveUsers() {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function getUserConfig(userId) {
  loadUsers();
  const base = users[userId] || { intro: null, outro: null, favorites: [] };
  if (!base.favorites) base.favorites = [];
  return base;
}

function setIntro(userId, soundId) {
  loadUsers();
  users[userId] = users[userId] || {};
  users[userId].intro = soundId || null;
  saveUsers();
}

function setOutro(userId, soundId) {
  loadUsers();
  users[userId] = users[userId] || {};
  users[userId].outro = soundId || null;
  saveUsers();
}

function setFavorites(userId, favorites) {
  loadUsers();
  users[userId] = users[userId] || {};
  const uniq = Array.from(new Set(favorites || [])).filter(Boolean);
  users[userId].favorites = uniq;
  saveUsers();
}

function getFavorites(userId) {
  return getUserConfig(userId).favorites || [];
}

module.exports = { getUserConfig, setIntro, setOutro, setFavorites, getFavorites };
