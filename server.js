const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DEFAULT_RATING = 1200;
const K_FACTOR = 24;
const DEFAULT_USER = 'troy';
const app = express();
const db = new Database(path.join(__dirname, 'baby-names.db'));

initializeDatabase();

app.use(express.json());
app.use('/static', express.static(__dirname, { index: false }));

app.get('/', (_req, res) => {
  res.redirect(`/${DEFAULT_USER}`);
});

app.get('/results', (_req, res) => {
  res.sendFile(path.join(__dirname, 'results.html'));
});

app.get('/api/results', (_req, res) => {
  try {
    ensureRatingsForAllUsers();
    res.json(buildState(DEFAULT_USER));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/state/:userSlug', (req, res) => {
  try {
    const user = ensureUser(req.params.userSlug);
    ensureRatingsForAllUsers();
    res.json(buildState(user.slug));
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/users', (req, res) => {
  try {
    const user = ensureUser(req.body.slug);
    ensureRatingsForUser(user.id);
    res.status(201).json({ user });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/names', (req, res) => {
  try {
    const submittedNames = Array.isArray(req.body.names) ? req.body.names : [];
    addNames(submittedNames);
    ensureRatingsForAllUsers();
    res.status(201).json({ state: buildState(normalizeSlug(req.body.userSlug) || DEFAULT_USER) });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/names/:nameId', (req, res) => {
  try {
    const activeUserSlug = normalizeSlug(req.query.userSlug) || DEFAULT_USER;
    deleteName(Number(req.params.nameId));
    res.json({ state: buildState(activeUserSlug) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/comparisons', (req, res) => {
  try {
    const user = ensureUser(req.body.userSlug);
    const winnerId = Number(req.body.winnerId);
    const loserId = Number(req.body.loserId);

    if (!Number.isInteger(winnerId) || !Number.isInteger(loserId) || winnerId === loserId) {
      res.status(400).json({ error: 'A comparison needs two distinct names.' });
      return;
    }

    recordComparison(user.id, winnerId, loserId);
    res.status(201).json({ state: buildState(user.slug) });
  } catch (error) {
    handleError(res, error);
  }
});

app.get(/^\/api\/.*/, (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Baby Name Pairwise running at http://localhost:${PORT}`);
});

function initializeDatabase() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ratings (
      user_id INTEGER NOT NULL,
      name_id INTEGER NOT NULL,
      rating REAL NOT NULL DEFAULT ${DEFAULT_RATING},
      PRIMARY KEY (user_id, name_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (name_id) REFERENCES names(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      winner_name_id INTEGER NOT NULL,
      loser_name_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_name_id) REFERENCES names(id) ON DELETE CASCADE,
      FOREIGN KEY (loser_name_id) REFERENCES names(id) ON DELETE CASCADE
    );
  `);

  ensureUser(DEFAULT_USER);
}

function ensureUser(rawSlug) {
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    throw new Error('User slug is required.');
  }

  db.prepare('INSERT OR IGNORE INTO users (slug) VALUES (?)').run(slug);

  const user = db.prepare('SELECT id, slug FROM users WHERE slug = ?').get(slug);
  ensureRatingsForUser(user.id);
  return user;
}

function addNames(rawNames) {
  const insert = db.prepare('INSERT OR IGNORE INTO names (name) VALUES (?)');

  const transaction = db.transaction((names) => {
    for (const rawName of names) {
      const name = cleanName(rawName);
      if (!name) {
        continue;
      }

      insert.run(name);
    }
  });

  transaction(rawNames);
}

function deleteName(nameId) {
  if (!Number.isInteger(nameId)) {
    throw new Error('A valid name id is required.');
  }

  const name = db.prepare('SELECT id FROM names WHERE id = ?').get(nameId);

  if (!name) {
    throw new Error('Name not found.');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM comparisons WHERE winner_name_id = ? OR loser_name_id = ?').run(nameId, nameId);
    db.prepare('DELETE FROM ratings WHERE name_id = ?').run(nameId);
    db.prepare('DELETE FROM names WHERE id = ?').run(nameId);
  })();
}

function ensureRatingsForAllUsers() {
  const users = db.prepare('SELECT id FROM users').all();
  for (const user of users) {
    ensureRatingsForUser(user.id);
  }
}

function ensureRatingsForUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO ratings (user_id, name_id, rating)
    SELECT ?, names.id, ${DEFAULT_RATING}
    FROM names
  `).run(userId);
}

function recordComparison(userId, winnerId, loserId) {
  const winner = db.prepare('SELECT id FROM names WHERE id = ?').get(winnerId);
  const loser = db.prepare('SELECT id FROM names WHERE id = ?').get(loserId);

  if (!winner || !loser) {
    throw new Error('Both names must exist before comparing them.');
  }

  ensureRatingsForUser(userId);

  db.transaction(() => {
    const winnerRow = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND name_id = ?').get(userId, winnerId);
    const loserRow = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND name_id = ?').get(userId, loserId);

    const winnerExpected = expectedScore(winnerRow.rating, loserRow.rating);
    const loserExpected = expectedScore(loserRow.rating, winnerRow.rating);
    const nextWinnerRating = winnerRow.rating + K_FACTOR * (1 - winnerExpected);
    const nextLoserRating = loserRow.rating + K_FACTOR * (0 - loserExpected);

    db.prepare('UPDATE ratings SET rating = ? WHERE user_id = ? AND name_id = ?').run(nextWinnerRating, userId, winnerId);
    db.prepare('UPDATE ratings SET rating = ? WHERE user_id = ? AND name_id = ?').run(nextLoserRating, userId, loserId);
    db.prepare('INSERT INTO comparisons (user_id, winner_name_id, loser_name_id) VALUES (?, ?, ?)').run(userId, winnerId, loserId);
  })();
}

function buildState(activeSlug) {
  const activeUser = ensureUser(activeSlug);
  ensureRatingsForAllUsers();

  const users = db.prepare('SELECT id, slug FROM users ORDER BY slug').all();
  const names = db.prepare('SELECT id, name FROM names ORDER BY name COLLATE NOCASE').all();
  const comparisonRows = db.prepare(`
    SELECT user_id, COUNT(*) AS count
    FROM comparisons
    GROUP BY user_id
  `).all();
  const comparisonCounts = new Map(comparisonRows.map((row) => [row.user_id, row.count]));

  const rankings = users.map((user) => {
    const rankedNames = db.prepare(`
      SELECT names.id, names.name, ratings.rating
      FROM ratings
      JOIN names ON names.id = ratings.name_id
      WHERE ratings.user_id = ?
      ORDER BY ratings.rating DESC, names.name COLLATE NOCASE ASC
    `).all(user.id);

    return {
      slug: user.slug,
      comparisonCount: comparisonCounts.get(user.id) || 0,
      names: rankedNames,
    };
  });

  return {
    activeUser: activeUser.slug,
    users: users.map((user) => ({ slug: user.slug })),
    names,
    rankings,
  };
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function cleanName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function handleError(res, error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(400).json({ error: message });
}
