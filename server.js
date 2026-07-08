const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureNamePopularityColumns, initializeSsaPopularity, updateSsaPopularityForNames } = require('./ssa-popularity');
const { ensureNameBtnColumns, initializeBtnMetadata, updateBtnMetadataForNames } = require('./btn-metadata');

const PORT = process.env.PORT || 3000;
const DEFAULT_RATING = 1200;
const K_FACTOR = 24;
const DEFAULT_USER = 'guest';
const SHOWTIME_DEFAULT_USER = 'guest';
const FINALE_DEFAULT_USER = 'guest';
const FINALE_LAST_NAME = 'Mulholland';
const ARLO_LOG_LIMIT = 60;
const OUNCES_TO_ML = 29.5735;
const ARLO_TIME_ZONE = 'America/Chicago';
const ARLO_FUEL_LOOKBACK_DAYS = 14;
const ARLO_FUEL_RECENT_WINDOW_HOURS = 24;
const ARLO_FUEL_DEFAULT_TAU_HOURS = 1.25;
const ARLO_FUEL_TAU_OPTIONS = [1, 1.25, 1.5];
const ARLO_FUEL_FULL_PERCENTILE = 90;
const ARLO_MAX_REASONABLE_FEED_ML = 400;
const ARLO_SIMULATED_FEED_OPTIONS_ML = [30, 60, 120];
const SUMMARY_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24 * 30;
const SUMMARY_FETCH_DELAY_MS = 250;
const app = express();
const db = new Database(path.join(__dirname, 'baby-names.db'));

const summaryQueue = [];
const queuedSummaryIds = new Set();
let isRefreshingSummaries = false;

initializeDatabase();
initializeShowtimeDatabase();
initializeFinaleDatabase();
initializeArloDatabase();
queueSummaryRefreshForAllNames();
void initializeSsaPopularity(db);
void initializeBtnMetadata(db);

app.use(express.json());
app.use('/static', express.static(__dirname, { index: false }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'start.html'));
});

app.get('/start', (_req, res) => {
  res.redirect('/');
});

app.get('/showtime', (_req, res) => {
  res.sendFile(path.join(__dirname, 'showtime-start.html'));
});

app.get('/showtime/results', (_req, res) => {
  res.sendFile(path.join(__dirname, 'showtime-results.html'));
});

app.get('/showtime/combined', (_req, res) => {
  res.sendFile(path.join(__dirname, 'showtime-combined.html'));
});

app.get('/finale', (_req, res) => {
  res.sendFile(path.join(__dirname, 'finale-start.html'));
});

app.get('/finale/results', (_req, res) => {
  res.sendFile(path.join(__dirname, 'finale-results.html'));
});

app.get('/finale/combined', (_req, res) => {
  res.sendFile(path.join(__dirname, 'finale-combined.html'));
});

app.get('/arlo', (_req, res) => {
  res.sendFile(path.join(__dirname, 'arlo.html'));
});

app.get('/results', (_req, res) => {
  res.sendFile(path.join(__dirname, 'results.html'));
});

app.get('/combined', (_req, res) => {
  res.sendFile(path.join(__dirname, 'combined.html'));
});

app.get('/api/results', (_req, res) => {
  try {
    ensureRatingsForAllUsers();
    res.json(buildState(DEFAULT_USER));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/combined', (req, res) => {
  try {
    ensureRatingsForAllUsers();
    res.json(buildCombinedState(req.query.users));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/showtime/results', (_req, res) => {
  try {
    ensureShowtimeRatingsForAllUsers();
    res.json(buildShowtimeState(SHOWTIME_DEFAULT_USER));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/showtime/combined', (req, res) => {
  try {
    ensureShowtimeRatingsForAllUsers();
    res.json(buildShowtimeCombinedState(req.query.users));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/finale/results', (_req, res) => {
  try {
    ensureFinaleRatingsForAllUsers();
    res.json(buildFinaleState(FINALE_DEFAULT_USER));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/finale/combined', (req, res) => {
  try {
    ensureFinaleRatingsForAllUsers();
    res.json(buildFinaleCombinedState(req.query.users));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/arlo', (req, res) => {
  try {
    res.json(buildArloState(req.query));
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

app.get('/api/showtime/state/:userSlug', (req, res) => {
  try {
    const user = ensureShowtimeUser(req.params.userSlug);
    ensureShowtimeRatingsForAllUsers();
    res.json(buildShowtimeState(user.slug));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/finale/state/:userSlug', (req, res) => {
  try {
    const user = ensureFinaleUser(req.params.userSlug);
    ensureFinaleRatingsForAllUsers();
    res.json(buildFinaleState(user.slug));
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

app.post('/api/showtime/users', (req, res) => {
  try {
    const user = ensureShowtimeUser(req.body.slug);
    ensureShowtimeRatingsForUser(user.id);
    res.status(201).json({ user });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/finale/users', (req, res) => {
  try {
    const user = ensureFinaleUser(req.body.slug);
    ensureFinaleRatingsForUser(user.id);
    res.status(201).json({ user });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/names', (req, res) => {
  try {
    const submittedNames = Array.isArray(req.body.names) ? req.body.names : [];
    const addedNames = addNames(submittedNames);
    ensureRatingsForAllUsers();
    queueSummaryRefreshForNames(addedNames);
    updateSsaPopularityForNames(db, addedNames);
    updateBtnMetadataForNames(db, addedNames);
    res.status(201).json({ state: buildState(normalizeSlug(req.body.userSlug) || DEFAULT_USER) });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/showtime/source-names', (_req, res) => {
  try {
    res.json({
      names: buildShowtimeSourceNames(),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/showtime/names', (req, res) => {
  try {
    const submittedNames = Array.isArray(req.body.names) ? req.body.names : [];
    addShowtimeNames(submittedNames);
    ensureShowtimeRatingsForAllUsers();
    res.status(201).json({ state: buildShowtimeState(normalizeSlug(req.body.userSlug) || SHOWTIME_DEFAULT_USER) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/finale/first-names', (req, res) => {
  try {
    const submittedNames = Array.isArray(req.body.names) ? req.body.names : [];
    addFinaleFirstNames(submittedNames);
    ensureFinaleRatingsForAllUsers();
    res.status(201).json({ state: buildFinaleState(normalizeSlug(req.body.userSlug) || FINALE_DEFAULT_USER) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/finale/middle-names', (req, res) => {
  try {
    const submittedNames = Array.isArray(req.body.names) ? req.body.names : [];
    addFinaleMiddleNames(submittedNames);
    ensureFinaleRatingsForAllUsers();
    res.status(201).json({ state: buildFinaleState(normalizeSlug(req.body.userSlug) || FINALE_DEFAULT_USER) });
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

app.delete('/api/showtime/names/:nameId', (req, res) => {
  try {
    const activeUserSlug = normalizeSlug(req.query.userSlug) || SHOWTIME_DEFAULT_USER;
    deleteShowtimeName(Number(req.params.nameId));
    res.json({ state: buildShowtimeState(activeUserSlug) });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/finale/first-names/:nameId', (req, res) => {
  try {
    const activeUserSlug = normalizeSlug(req.query.userSlug) || FINALE_DEFAULT_USER;
    deleteFinaleFirstName(Number(req.params.nameId));
    res.json({ state: buildFinaleState(activeUserSlug) });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/finale/middle-names/:nameId', (req, res) => {
  try {
    const activeUserSlug = normalizeSlug(req.query.userSlug) || FINALE_DEFAULT_USER;
    deleteFinaleMiddleName(Number(req.params.nameId));
    res.json({ state: buildFinaleState(activeUserSlug) });
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

app.post('/api/showtime/comparisons', (req, res) => {
  try {
    const user = ensureShowtimeUser(req.body.userSlug);
    const winnerId = Number(req.body.winnerId);
    const loserId = Number(req.body.loserId);

    if (!Number.isInteger(winnerId) || !Number.isInteger(loserId) || winnerId === loserId) {
      res.status(400).json({ error: 'A comparison needs two distinct names.' });
      return;
    }

    recordShowtimeComparison(user.id, winnerId, loserId);
    res.status(201).json({ state: buildShowtimeState(user.slug) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/finale/comparisons', (req, res) => {
  try {
    const user = ensureFinaleUser(req.body.userSlug);
    const winnerFirstId = Number(req.body.winnerFirstId);
    const winnerMiddleId = Number(req.body.winnerMiddleId);
    const loserFirstId = Number(req.body.loserFirstId);
    const loserMiddleId = Number(req.body.loserMiddleId);

    if (
      !Number.isInteger(winnerFirstId) ||
      !Number.isInteger(winnerMiddleId) ||
      !Number.isInteger(loserFirstId) ||
      !Number.isInteger(loserMiddleId)
    ) {
      res.status(400).json({ error: 'A comparison needs two valid first-and-middle combinations.' });
      return;
    }

    if (winnerFirstId === loserFirstId && winnerMiddleId === loserMiddleId) {
      res.status(400).json({ error: 'The two sides must be different first-and-middle combinations.' });
      return;
    }

    recordFinaleComparison(user.id, winnerFirstId, winnerMiddleId, loserFirstId, loserMiddleId);
    res.status(201).json({ state: buildFinaleState(user.slug) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/arlo/events', (req, res) => {
  try {
    recordArloEvent(req.body || {});
    res.status(201).json(buildArloState(req.query));
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/arlo/events/:eventId', (req, res) => {
  try {
    deleteArloEvent(Number(req.params.eventId));
    res.json(buildArloState(req.query));
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/showtime/:userSlug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'showtime.html'));
});

app.get('/finale/:userSlug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'finale.html'));
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

  ensureNameSummaryColumns();
  ensureNamePopularityColumns(db);
  ensureNameBtnColumns(db);
  ensureUser(DEFAULT_USER);
}

function initializeShowtimeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS showtime_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS showtime_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      wiki_summary TEXT,
      wiki_source_url TEXT,
      wiki_status TEXT NOT NULL DEFAULT 'pending',
      wiki_updated_at TEXT,
      ssa_year INTEGER,
      ssa_births INTEGER,
      ssa_rank INTEGER,
      ssa_updated_at TEXT,
      btn_usage TEXT,
      btn_origin TEXT,
      btn_language_root TEXT,
      btn_status TEXT NOT NULL DEFAULT 'pending',
      btn_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS showtime_ratings (
      user_id INTEGER NOT NULL,
      name_id INTEGER NOT NULL,
      rating REAL NOT NULL DEFAULT ${DEFAULT_RATING},
      PRIMARY KEY (user_id, name_id),
      FOREIGN KEY (user_id) REFERENCES showtime_users(id) ON DELETE CASCADE,
      FOREIGN KEY (name_id) REFERENCES showtime_names(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS showtime_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      winner_name_id INTEGER NOT NULL,
      loser_name_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES showtime_users(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_name_id) REFERENCES showtime_names(id) ON DELETE CASCADE,
      FOREIGN KEY (loser_name_id) REFERENCES showtime_names(id) ON DELETE CASCADE
    );
  `);

  ensureShowtimeUser(SHOWTIME_DEFAULT_USER);
}

function initializeFinaleDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS finale_first_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS finale_middle_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS finale_ratings (
      user_id INTEGER NOT NULL,
      first_name_id INTEGER NOT NULL,
      middle_name_id INTEGER NOT NULL,
      rating REAL NOT NULL DEFAULT ${DEFAULT_RATING},
      PRIMARY KEY (user_id, first_name_id, middle_name_id),
      FOREIGN KEY (user_id) REFERENCES finale_users(id) ON DELETE CASCADE,
      FOREIGN KEY (first_name_id) REFERENCES finale_first_names(id) ON DELETE CASCADE,
      FOREIGN KEY (middle_name_id) REFERENCES finale_middle_names(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS finale_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      winner_first_name_id INTEGER NOT NULL,
      winner_middle_name_id INTEGER NOT NULL,
      loser_first_name_id INTEGER NOT NULL,
      loser_middle_name_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES finale_users(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_first_name_id) REFERENCES finale_first_names(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_middle_name_id) REFERENCES finale_middle_names(id) ON DELETE CASCADE,
      FOREIGN KEY (loser_first_name_id) REFERENCES finale_first_names(id) ON DELETE CASCADE,
      FOREIGN KEY (loser_middle_name_id) REFERENCES finale_middle_names(id) ON DELETE CASCADE
    );
  `);

  ensureFinaleUser(FINALE_DEFAULT_USER);
}

function initializeArloDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arlo_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      amount_value REAL,
      amount_unit TEXT,
      poop_color TEXT,
      shart INTEGER NOT NULL DEFAULT 0,
      vitamin_d INTEGER NOT NULL DEFAULT 0,
      breast_side TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const columns = new Set(db.prepare('PRAGMA table_info(arlo_events)').all().map((column) => column.name));
  if (!columns.has('amount_unit')) {
    db.exec('ALTER TABLE arlo_events ADD COLUMN amount_unit TEXT');
  }
  if (!columns.has('poop_color')) {
    db.exec('ALTER TABLE arlo_events ADD COLUMN poop_color TEXT');
  }
  if (!columns.has('shart')) {
    db.exec('ALTER TABLE arlo_events ADD COLUMN shart INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.has('vitamin_d')) {
    db.exec('ALTER TABLE arlo_events ADD COLUMN vitamin_d INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.has('breast_side')) {
    db.exec('ALTER TABLE arlo_events ADD COLUMN breast_side TEXT');
  }
}

function ensureNameSummaryColumns() {
  const columns = new Set(db.prepare('PRAGMA table_info(names)').all().map((column) => column.name));

  if (!columns.has('wiki_summary')) {
    db.exec("ALTER TABLE names ADD COLUMN wiki_summary TEXT");
  }

  if (!columns.has('wiki_source_url')) {
    db.exec("ALTER TABLE names ADD COLUMN wiki_source_url TEXT");
  }

  if (!columns.has('wiki_status')) {
    db.exec("ALTER TABLE names ADD COLUMN wiki_status TEXT NOT NULL DEFAULT 'pending'");
  }

  if (!columns.has('wiki_updated_at')) {
    db.exec("ALTER TABLE names ADD COLUMN wiki_updated_at TEXT");
  }
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
  const insert = db.prepare("INSERT OR IGNORE INTO names (name, wiki_status) VALUES (?, 'pending')");
  const findByName = db.prepare('SELECT id, name FROM names WHERE name = ? COLLATE NOCASE');
  const addedNames = [];

  const transaction = db.transaction((names) => {
    for (const rawName of names) {
      const name = cleanName(rawName);
      if (!name) {
        continue;
      }

      const result = insert.run(name);
      const entry = findByName.get(name);

      if (result.changes > 0 && entry) {
        addedNames.push(entry);
      }
    }
  });

  transaction(rawNames);
  return addedNames;
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
  const nameComparisonRows = db.prepare(`
    SELECT name_id, COUNT(*) AS count
    FROM (
      SELECT winner_name_id AS name_id
      FROM comparisons
      WHERE user_id = ?
      UNION ALL
      SELECT loser_name_id AS name_id
      FROM comparisons
      WHERE user_id = ?
    )
    GROUP BY name_id
  `).all(activeUser.id, activeUser.id);
  const nameComparisonCounts = new Map(nameComparisonRows.map((row) => [row.name_id, row.count]));
  const names = db.prepare(`
    SELECT id, name, wiki_summary, wiki_source_url, wiki_status, wiki_updated_at, ssa_year, ssa_births, ssa_rank, btn_usage, btn_origin, btn_language_root, btn_status
    FROM names
    ORDER BY name COLLATE NOCASE
  `).all().map((name) => ({
    id: name.id,
    name: name.name,
    summary: name.wiki_summary || '',
    summarySourceUrl: name.wiki_source_url || '',
    summaryStatus: name.wiki_status || 'pending',
    summaryUpdatedAt: name.wiki_updated_at || null,
    ssaYear: name.ssa_year || null,
    ssaBirths: name.ssa_births || null,
    ssaRank: name.ssa_rank || null,
    btnUsage: name.btn_usage || '',
    btnOrigin: name.btn_origin || '',
    btnLanguageRoot: name.btn_language_root || '',
    btnStatus: name.btn_status || 'pending',
    comparisonCount: nameComparisonCounts.get(name.id) || 0,
  }));
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

function buildCombinedState(rawSelectedUsers) {
  const users = db.prepare('SELECT id, slug FROM users ORDER BY slug').all();
  const names = db.prepare('SELECT id, name FROM names ORDER BY name COLLATE NOCASE').all();
  const comparisonRows = db.prepare(`
    SELECT user_id, COUNT(*) AS count
    FROM comparisons
    GROUP BY user_id
  `).all();
  const comparisonCounts = new Map(comparisonRows.map((row) => [row.user_id, row.count]));
  const selectedSlugs = resolveSelectedSlugs(rawSelectedUsers, users);
  const selectedUsers = users.filter((user) => selectedSlugs.includes(user.slug));
  const ratingRows = selectedUsers.length
    ? db.prepare(`
        SELECT ratings.name_id, ratings.rating
        FROM ratings
        WHERE ratings.user_id IN (${selectedUsers.map(() => '?').join(', ')})
      `).all(...selectedUsers.map((user) => user.id))
    : [];

  const ratingsByNameId = new Map(names.map((name) => [name.id, []]));
  for (const row of ratingRows) {
    ratingsByNameId.get(row.name_id).push(row.rating);
  }

  const combinedNames = names
    .map((name) => {
      const selectedRatings = ratingsByNameId.get(name.id) || [];
      const combinedRating = selectedRatings.length
        ? selectedRatings.reduce((sum, rating) => sum + rating, 0) / selectedRatings.length
        : DEFAULT_RATING;

      return {
        id: name.id,
        name: name.name,
        rating: combinedRating,
      };
    })
    .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name));

  return {
    users: users.map((user) => ({
      slug: user.slug,
      included: selectedSlugs.includes(user.slug),
    })),
    combinedRanking: {
      selectedUsers: selectedSlugs,
      userCount: selectedUsers.length,
      comparisonCount: selectedUsers.reduce((sum, user) => sum + (comparisonCounts.get(user.id) || 0), 0),
      names: combinedNames,
    },
  };
}

function ensureShowtimeUser(rawSlug) {
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    throw new Error('User slug is required.');
  }

  db.prepare('INSERT OR IGNORE INTO showtime_users (slug) VALUES (?)').run(slug);

  const user = db.prepare('SELECT id, slug FROM showtime_users WHERE slug = ?').get(slug);
  ensureShowtimeRatingsForUser(user.id);
  return user;
}

function ensureShowtimeRatingsForAllUsers() {
  const users = db.prepare('SELECT id FROM showtime_users').all();
  for (const user of users) {
    ensureShowtimeRatingsForUser(user.id);
  }
}

function ensureShowtimeRatingsForUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO showtime_ratings (user_id, name_id, rating)
    SELECT ?, showtime_names.id, ${DEFAULT_RATING}
    FROM showtime_names
  `).run(userId);
}

function addShowtimeNames(rawNames) {
  const insertFromSource = db.prepare(`
    INSERT OR IGNORE INTO showtime_names (
      name,
      wiki_summary,
      wiki_source_url,
      wiki_status,
      wiki_updated_at,
      ssa_year,
      ssa_births,
      ssa_rank,
      ssa_updated_at,
      btn_usage,
      btn_origin,
      btn_language_root,
      btn_status,
      btn_updated_at
    )
    SELECT
      names.name,
      names.wiki_summary,
      names.wiki_source_url,
      names.wiki_status,
      names.wiki_updated_at,
      names.ssa_year,
      names.ssa_births,
      names.ssa_rank,
      names.ssa_updated_at,
      names.btn_usage,
      names.btn_origin,
      names.btn_language_root,
      names.btn_status,
      names.btn_updated_at
    FROM names
    WHERE names.name = ? COLLATE NOCASE
  `);
  const insertManual = db.prepare(`
    INSERT OR IGNORE INTO showtime_names (
      name,
      wiki_status,
      btn_status
    ) VALUES (?, 'pending', 'pending')
  `);

  db.transaction((submittedNames) => {
    for (const rawName of submittedNames) {
      const name = cleanName(rawName);
      if (!name) {
        continue;
      }

      const sourceResult = insertFromSource.run(name);
      if (sourceResult.changes > 0) {
        continue;
      }

      insertManual.run(name);
    }
  })(rawNames);
}

function deleteShowtimeName(nameId) {
  if (!Number.isInteger(nameId)) {
    throw new Error('A valid name id is required.');
  }

  const name = db.prepare('SELECT id FROM showtime_names WHERE id = ?').get(nameId);

  if (!name) {
    throw new Error('Name not found.');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM showtime_comparisons WHERE winner_name_id = ? OR loser_name_id = ?').run(nameId, nameId);
    db.prepare('DELETE FROM showtime_ratings WHERE name_id = ?').run(nameId);
    db.prepare('DELETE FROM showtime_names WHERE id = ?').run(nameId);
  })();
}

function recordShowtimeComparison(userId, winnerId, loserId) {
  const winner = db.prepare('SELECT id FROM showtime_names WHERE id = ?').get(winnerId);
  const loser = db.prepare('SELECT id FROM showtime_names WHERE id = ?').get(loserId);

  if (!winner || !loser) {
    throw new Error('Both names must exist before comparing them.');
  }

  ensureShowtimeRatingsForUser(userId);

  db.transaction(() => {
    const winnerRow = db.prepare('SELECT rating FROM showtime_ratings WHERE user_id = ? AND name_id = ?').get(userId, winnerId);
    const loserRow = db.prepare('SELECT rating FROM showtime_ratings WHERE user_id = ? AND name_id = ?').get(userId, loserId);

    const winnerExpected = expectedScore(winnerRow.rating, loserRow.rating);
    const loserExpected = expectedScore(loserRow.rating, winnerRow.rating);
    const nextWinnerRating = winnerRow.rating + K_FACTOR * (1 - winnerExpected);
    const nextLoserRating = loserRow.rating + K_FACTOR * (0 - loserExpected);

    db.prepare('UPDATE showtime_ratings SET rating = ? WHERE user_id = ? AND name_id = ?').run(nextWinnerRating, userId, winnerId);
    db.prepare('UPDATE showtime_ratings SET rating = ? WHERE user_id = ? AND name_id = ?').run(nextLoserRating, userId, loserId);
    db.prepare('INSERT INTO showtime_comparisons (user_id, winner_name_id, loser_name_id) VALUES (?, ?, ?)').run(userId, winnerId, loserId);
  })();
}

function buildShowtimeState(activeSlug) {
  const activeUser = ensureShowtimeUser(activeSlug);
  ensureShowtimeRatingsForAllUsers();

  const users = db.prepare('SELECT id, slug FROM showtime_users ORDER BY slug').all();
  const nameComparisonRows = db.prepare(`
    SELECT name_id, COUNT(*) AS count
    FROM (
      SELECT winner_name_id AS name_id
      FROM showtime_comparisons
      WHERE user_id = ?
      UNION ALL
      SELECT loser_name_id AS name_id
      FROM showtime_comparisons
      WHERE user_id = ?
    )
    GROUP BY name_id
  `).all(activeUser.id, activeUser.id);
  const nameComparisonCounts = new Map(nameComparisonRows.map((row) => [row.name_id, row.count]));
  const names = db.prepare(`
    SELECT id, name, wiki_summary, wiki_source_url, wiki_status, wiki_updated_at, ssa_year, ssa_births, ssa_rank, btn_usage, btn_origin, btn_language_root, btn_status
    FROM showtime_names
    ORDER BY name COLLATE NOCASE
  `).all().map((name) => ({
    id: name.id,
    name: name.name,
    summary: name.wiki_summary || '',
    summarySourceUrl: name.wiki_source_url || '',
    summaryStatus: name.wiki_status || 'pending',
    summaryUpdatedAt: name.wiki_updated_at || null,
    ssaYear: name.ssa_year || null,
    ssaBirths: name.ssa_births || null,
    ssaRank: name.ssa_rank || null,
    btnUsage: name.btn_usage || '',
    btnOrigin: name.btn_origin || '',
    btnLanguageRoot: name.btn_language_root || '',
    btnStatus: name.btn_status || 'pending',
    comparisonCount: nameComparisonCounts.get(name.id) || 0,
  }));
  const comparisonRows = db.prepare(`
    SELECT user_id, COUNT(*) AS count
    FROM showtime_comparisons
    GROUP BY user_id
  `).all();
  const comparisonCounts = new Map(comparisonRows.map((row) => [row.user_id, row.count]));

  const rankings = users.map((user) => {
    const rankedNames = db.prepare(`
      SELECT showtime_names.id, showtime_names.name, showtime_ratings.rating
      FROM showtime_ratings
      JOIN showtime_names ON showtime_names.id = showtime_ratings.name_id
      WHERE showtime_ratings.user_id = ?
      ORDER BY showtime_ratings.rating DESC, showtime_names.name COLLATE NOCASE ASC
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
    sourceNames: buildShowtimeSourceNames(),
  };
}

function buildShowtimeCombinedState(rawSelectedUsers) {
  const comparisonRows = db.prepare(`
    SELECT user_id, COUNT(*) AS count
    FROM showtime_comparisons
    GROUP BY user_id
  `).all();
  const comparisonCounts = new Map(comparisonRows.map((row) => [row.user_id, row.count]));
  const users = db.prepare('SELECT id, slug FROM showtime_users ORDER BY slug').all()
    .filter((user) => (comparisonCounts.get(user.id) || 0) > 0);
  const names = db.prepare('SELECT id, name FROM showtime_names ORDER BY name COLLATE NOCASE').all();
  const selectedSlugs = resolveSelectedSlugs(rawSelectedUsers, users);
  const selectedUsers = users.filter((user) => selectedSlugs.includes(user.slug));
  const ratingRows = selectedUsers.length
    ? db.prepare(`
        SELECT showtime_ratings.name_id, showtime_ratings.rating
        FROM showtime_ratings
        WHERE showtime_ratings.user_id IN (${selectedUsers.map(() => '?').join(', ')})
      `).all(...selectedUsers.map((user) => user.id))
    : [];

  const ratingsByNameId = new Map(names.map((name) => [name.id, []]));
  for (const row of ratingRows) {
    ratingsByNameId.get(row.name_id).push(row.rating);
  }

  const combinedNames = names
    .map((name) => {
      const selectedRatings = ratingsByNameId.get(name.id) || [];
      const combinedRating = selectedRatings.length
        ? selectedRatings.reduce((sum, rating) => sum + rating, 0) / selectedRatings.length
        : DEFAULT_RATING;

      return {
        id: name.id,
        name: name.name,
        rating: combinedRating,
      };
    })
    .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name));

  return {
    users: users.map((user) => ({
      slug: user.slug,
      included: selectedSlugs.includes(user.slug),
    })),
    combinedRanking: {
      selectedUsers: selectedSlugs,
      userCount: selectedUsers.length,
      comparisonCount: selectedUsers.reduce((sum, user) => sum + (comparisonCounts.get(user.id) || 0), 0),
      names: combinedNames,
    },
  };
}

function buildShowtimeSourceNames() {
  ensureRatingsForAllUsers();

  const users = db.prepare('SELECT id FROM users').all();
  const ratingRows = users.length
    ? db.prepare(`
        SELECT ratings.name_id, ratings.rating
        FROM ratings
        WHERE ratings.user_id IN (${users.map(() => '?').join(', ')})
      `).all(...users.map((user) => user.id))
    : [];
  const ratingsByNameId = new Map();

  for (const row of ratingRows) {
    if (!ratingsByNameId.has(row.name_id)) {
      ratingsByNameId.set(row.name_id, []);
    }

    ratingsByNameId.get(row.name_id).push(row.rating);
  }

  const includedNames = new Set(
    db.prepare('SELECT name FROM showtime_names').all().map((row) => row.name.toLowerCase()),
  );

  return db.prepare(`
    SELECT id, name, wiki_summary, ssa_rank
    FROM names
    ORDER BY name COLLATE NOCASE
  `).all().map((row) => {
    const ratings = ratingsByNameId.get(row.id) || [];
    const averageRating = ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : DEFAULT_RATING;

    return {
      id: row.id,
      name: row.name,
      averageRating,
      summary: row.wiki_summary || '',
      ssaRank: row.ssa_rank || null,
      included: includedNames.has(row.name.toLowerCase()),
    };
  }).sort((left, right) => right.averageRating - left.averageRating || left.name.localeCompare(right.name));
}

function ensureFinaleUser(rawSlug) {
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    throw new Error('User slug is required.');
  }

  db.prepare('INSERT OR IGNORE INTO finale_users (slug) VALUES (?)').run(slug);

  const user = db.prepare('SELECT id, slug FROM finale_users WHERE slug = ?').get(slug);
  ensureFinaleRatingsForUser(user.id);
  return user;
}

function ensureFinaleRatingsForAllUsers() {
  const users = db.prepare('SELECT id FROM finale_users').all();
  for (const user of users) {
    ensureFinaleRatingsForUser(user.id);
  }
}

function ensureFinaleRatingsForUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO finale_ratings (user_id, first_name_id, middle_name_id, rating)
    SELECT ?, finale_first_names.id, finale_middle_names.id, ${DEFAULT_RATING}
    FROM finale_first_names
    CROSS JOIN finale_middle_names
  `).run(userId);
}

function addFinaleFirstNames(rawNames) {
  const insert = db.prepare('INSERT OR IGNORE INTO finale_first_names (name) VALUES (?)');

  db.transaction((submittedNames) => {
    for (const rawName of submittedNames) {
      const name = cleanName(rawName);
      if (!name) {
        continue;
      }

      insert.run(name);
    }
  })(rawNames);
}

function addFinaleMiddleNames(rawNames) {
  const insert = db.prepare('INSERT OR IGNORE INTO finale_middle_names (name) VALUES (?)');

  db.transaction((submittedNames) => {
    for (const rawName of submittedNames) {
      const name = cleanName(rawName);
      if (!name) {
        continue;
      }

      insert.run(name);
    }
  })(rawNames);
}

function deleteFinaleFirstName(nameId) {
  if (!Number.isInteger(nameId)) {
    throw new Error('A valid first name id is required.');
  }

  const row = db.prepare('SELECT id FROM finale_first_names WHERE id = ?').get(nameId);
  if (!row) {
    throw new Error('First name not found.');
  }

  db.transaction(() => {
    db.prepare(`
      DELETE FROM finale_comparisons
      WHERE winner_first_name_id = ? OR loser_first_name_id = ?
    `).run(nameId, nameId);
    db.prepare('DELETE FROM finale_ratings WHERE first_name_id = ?').run(nameId);
    db.prepare('DELETE FROM finale_first_names WHERE id = ?').run(nameId);
  })();
}

function deleteFinaleMiddleName(nameId) {
  if (!Number.isInteger(nameId)) {
    throw new Error('A valid middle name id is required.');
  }

  const row = db.prepare('SELECT id FROM finale_middle_names WHERE id = ?').get(nameId);
  if (!row) {
    throw new Error('Middle name not found.');
  }

  db.transaction(() => {
    db.prepare(`
      DELETE FROM finale_comparisons
      WHERE winner_middle_name_id = ? OR loser_middle_name_id = ?
    `).run(nameId, nameId);
    db.prepare('DELETE FROM finale_ratings WHERE middle_name_id = ?').run(nameId);
    db.prepare('DELETE FROM finale_middle_names WHERE id = ?').run(nameId);
  })();
}

function recordFinaleComparison(userId, winnerFirstId, winnerMiddleId, loserFirstId, loserMiddleId) {
  const winnerFirst = db.prepare('SELECT id FROM finale_first_names WHERE id = ?').get(winnerFirstId);
  const winnerMiddle = db.prepare('SELECT id FROM finale_middle_names WHERE id = ?').get(winnerMiddleId);
  const loserFirst = db.prepare('SELECT id FROM finale_first_names WHERE id = ?').get(loserFirstId);
  const loserMiddle = db.prepare('SELECT id FROM finale_middle_names WHERE id = ?').get(loserMiddleId);

  if (!winnerFirst || !winnerMiddle || !loserFirst || !loserMiddle) {
    throw new Error('Both sides must use existing first and middle names.');
  }

  ensureFinaleRatingsForUser(userId);

  db.transaction(() => {
    const winnerRow = db.prepare(`
      SELECT rating
      FROM finale_ratings
      WHERE user_id = ? AND first_name_id = ? AND middle_name_id = ?
    `).get(userId, winnerFirstId, winnerMiddleId);
    const loserRow = db.prepare(`
      SELECT rating
      FROM finale_ratings
      WHERE user_id = ? AND first_name_id = ? AND middle_name_id = ?
    `).get(userId, loserFirstId, loserMiddleId);

    const winnerExpected = expectedScore(winnerRow.rating, loserRow.rating);
    const loserExpected = expectedScore(loserRow.rating, winnerRow.rating);
    const nextWinnerRating = winnerRow.rating + K_FACTOR * (1 - winnerExpected);
    const nextLoserRating = loserRow.rating + K_FACTOR * (0 - loserExpected);

    db.prepare(`
      UPDATE finale_ratings
      SET rating = ?
      WHERE user_id = ? AND first_name_id = ? AND middle_name_id = ?
    `).run(nextWinnerRating, userId, winnerFirstId, winnerMiddleId);
    db.prepare(`
      UPDATE finale_ratings
      SET rating = ?
      WHERE user_id = ? AND first_name_id = ? AND middle_name_id = ?
    `).run(nextLoserRating, userId, loserFirstId, loserMiddleId);
    db.prepare(`
      INSERT INTO finale_comparisons (
        user_id,
        winner_first_name_id,
        winner_middle_name_id,
        loser_first_name_id,
        loser_middle_name_id
      ) VALUES (?, ?, ?, ?, ?)
    `).run(userId, winnerFirstId, winnerMiddleId, loserFirstId, loserMiddleId);
  })();
}

function buildFinaleState(activeSlug) {
  const activeUser = ensureFinaleUser(activeSlug);
  ensureFinaleRatingsForAllUsers();

  const users = db.prepare('SELECT id, slug FROM finale_users ORDER BY slug').all();
  const firstNames = db.prepare('SELECT id, name FROM finale_first_names ORDER BY name COLLATE NOCASE').all();
  const middleNames = db.prepare('SELECT id, name FROM finale_middle_names ORDER BY name COLLATE NOCASE').all();
  const combinationRows = buildFinaleCombinations();
  const comboComparisonRows = db.prepare(`
    SELECT
      user_id,
      first_name_id,
      middle_name_id,
      COUNT(*) AS count
    FROM (
      SELECT user_id, winner_first_name_id AS first_name_id, winner_middle_name_id AS middle_name_id
      FROM finale_comparisons
      UNION ALL
      SELECT user_id, loser_first_name_id AS first_name_id, loser_middle_name_id AS middle_name_id
      FROM finale_comparisons
    )
    GROUP BY user_id, first_name_id, middle_name_id
  `).all();
  const comboComparisonCounts = new Map(
    comboComparisonRows.map((row) => [`${row.user_id}:${getFinaleCombinationKey(row.first_name_id, row.middle_name_id)}`, row.count]),
  );
  const comparisonRows = db.prepare(`
    SELECT user_id, COUNT(*) AS count
    FROM finale_comparisons
    GROUP BY user_id
  `).all();
  const comparisonCounts = new Map(comparisonRows.map((row) => [row.user_id, row.count]));

  const rankings = users.map((user) => {
    const rankedCombos = db.prepare(`
      SELECT
        finale_ratings.first_name_id,
        finale_ratings.middle_name_id,
        finale_ratings.rating,
        finale_first_names.name AS first_name,
        finale_middle_names.name AS middle_name
      FROM finale_ratings
      JOIN finale_first_names ON finale_first_names.id = finale_ratings.first_name_id
      JOIN finale_middle_names ON finale_middle_names.id = finale_ratings.middle_name_id
      WHERE finale_ratings.user_id = ?
      ORDER BY finale_ratings.rating DESC, finale_first_names.name COLLATE NOCASE ASC, finale_middle_names.name COLLATE NOCASE ASC
    `).all(user.id).map((row) => ({
      firstNameId: row.first_name_id,
      middleNameId: row.middle_name_id,
      firstName: row.first_name,
      middleName: row.middle_name,
      fullName: buildFinaleFullName(row.first_name, row.middle_name),
      rating: row.rating,
      comparisonCount: comboComparisonCounts.get(`${user.id}:${getFinaleCombinationKey(row.first_name_id, row.middle_name_id)}`) || 0,
    }));

    return {
      slug: user.slug,
      comparisonCount: comparisonCounts.get(user.id) || 0,
      names: rankedCombos,
    };
  });

  return {
    activeUser: activeUser.slug,
    users: users.map((user) => ({ slug: user.slug })),
    firstNames,
    middleNames,
    combinations: combinationRows,
    rankings,
    lastName: FINALE_LAST_NAME,
  };
}

function buildFinaleCombinedState(rawSelectedUsers) {
  const comparisonRows = db.prepare(`
    SELECT user_id, COUNT(*) AS count
    FROM finale_comparisons
    GROUP BY user_id
  `).all();
  const comparisonCounts = new Map(comparisonRows.map((row) => [row.user_id, row.count]));
  const users = db.prepare('SELECT id, slug FROM finale_users ORDER BY slug').all()
    .filter((user) => (comparisonCounts.get(user.id) || 0) > 0);
  const selectedSlugs = resolveSelectedSlugs(rawSelectedUsers, users);
  const selectedUsers = users.filter((user) => selectedSlugs.includes(user.slug));
  const combinationRows = buildFinaleCombinations();
  const ratingRows = selectedUsers.length
    ? db.prepare(`
        SELECT first_name_id, middle_name_id, rating
        FROM finale_ratings
        WHERE user_id IN (${selectedUsers.map(() => '?').join(', ')})
      `).all(...selectedUsers.map((user) => user.id))
    : [];

  const ratingsByKey = new Map(combinationRows.map((row) => [getFinaleCombinationKey(row.firstNameId, row.middleNameId), []]));
  for (const row of ratingRows) {
    ratingsByKey.get(getFinaleCombinationKey(row.first_name_id, row.middle_name_id)).push(row.rating);
  }

  const combinedNames = combinationRows
    .map((row) => {
      const selectedRatings = ratingsByKey.get(getFinaleCombinationKey(row.firstNameId, row.middleNameId)) || [];
      const combinedRating = selectedRatings.length
        ? selectedRatings.reduce((sum, rating) => sum + rating, 0) / selectedRatings.length
        : DEFAULT_RATING;

      return {
        firstNameId: row.firstNameId,
        middleNameId: row.middleNameId,
        firstName: row.firstName,
        middleName: row.middleName,
        fullName: row.fullName,
        rating: combinedRating,
      };
    })
    .sort((left, right) => right.rating - left.rating || left.fullName.localeCompare(right.fullName));

  return {
    users: users.map((user) => ({
      slug: user.slug,
      included: selectedSlugs.includes(user.slug),
    })),
    combinedRanking: {
      selectedUsers: selectedSlugs,
      userCount: selectedUsers.length,
      comparisonCount: selectedUsers.reduce((sum, user) => sum + (comparisonCounts.get(user.id) || 0), 0),
      names: combinedNames,
    },
    lastName: FINALE_LAST_NAME,
  };
}

function buildFinaleCombinations() {
  return db.prepare(`
    SELECT
      finale_first_names.id AS first_name_id,
      finale_middle_names.id AS middle_name_id,
      finale_first_names.name AS first_name,
      finale_middle_names.name AS middle_name
    FROM finale_first_names
    CROSS JOIN finale_middle_names
    ORDER BY finale_first_names.name COLLATE NOCASE, finale_middle_names.name COLLATE NOCASE
  `).all().map((row) => ({
    firstNameId: row.first_name_id,
    middleNameId: row.middle_name_id,
    firstName: row.first_name,
    middleName: row.middle_name,
    fullName: buildFinaleFullName(row.first_name, row.middle_name),
  }));
}

function buildFinaleFullName(firstName, middleName) {
  return `${firstName} ${middleName} ${FINALE_LAST_NAME}`.replace(/\s+/g, ' ').trim();
}

function getFinaleCombinationKey(firstNameId, middleNameId) {
  return `${firstNameId}:${middleNameId}`;
}

function buildArloState(options = {}) {
  const tauHours = normalizeArloTauHours(options.tauHours);
  const recentEvents = db.prepare(`
    SELECT id, activity_type, event_date, event_time, amount_value, amount_unit, poop_color, shart, vitamin_d, breast_side, created_at
    FROM arlo_events
    ORDER BY event_date DESC, event_time DESC, id DESC
    LIMIT ?
  `).all(ARLO_LOG_LIMIT).map((row) => ({
    id: row.id,
    activityType: row.activity_type,
    eventDate: row.event_date,
    eventTime: row.event_time,
    amountValue: row.amount_value,
    amountUnit: row.amount_unit || '',
    poopColor: row.poop_color || '',
    shart: Boolean(row.shart),
    vitaminD: Boolean(row.vitamin_d),
    breastSide: row.breast_side || '',
    createdAt: row.created_at,
  }));

  const summaryDates = db.prepare(`
    SELECT DISTINCT event_date
    FROM arlo_events
    ORDER BY event_date DESC
    LIMIT 7
  `).all().map((row) => row.event_date);
  const summaries = summaryDates.map((date) => buildArloDailySummary(date));
  const trendDates = db.prepare(`
    SELECT DISTINCT event_date
    FROM arlo_events
    ORDER BY event_date DESC
  `).all().map((row) => row.event_date);
  const trendSummaries = trendDates.map((date) => buildArloDailySummary(date));
  const fuelGauge = computeArloFuelGauge(new Date(), tauHours);

  return {
    lastName: FINALE_LAST_NAME,
    fuelGauge,
    recentEvents,
    todaySummary: summaries[0] || buildArloDailySummary(formatDateInTimeZone(new Date(), 'America/Chicago')),
    summaries,
    trendSummaries,
  };
}

function buildArloDailySummary(date) {
  const countsRows = db.prepare(`
    SELECT activity_type, COUNT(*) AS count
    FROM arlo_events
    WHERE event_date = ?
    GROUP BY activity_type
  `).all(date);
  const counts = Object.fromEntries(countsRows.map((row) => [row.activity_type, row.count]));
  const latestRows = db.prepare(`
    SELECT activity_type, event_time
    FROM arlo_events
    WHERE event_date = ?
      AND id IN (
        SELECT id
        FROM arlo_events latest
        WHERE latest.event_date = arlo_events.event_date
          AND latest.activity_type = arlo_events.activity_type
        ORDER BY latest.event_time DESC, latest.id DESC
        LIMIT 1
      )
  `).all(date);
  const latestByActivity = Object.fromEntries(latestRows.map((row) => [row.activity_type, row.event_time]));
  const eventTimesRows = db.prepare(`
    SELECT activity_type, event_time, shart, vitamin_d, breast_side
    FROM arlo_events
    WHERE event_date = ?
    ORDER BY event_time ASC, id ASC
  `).all(date);
  const eventTimesByActivity = {};
  for (const row of eventTimesRows) {
    if (!eventTimesByActivity[row.activity_type]) {
      eventTimesByActivity[row.activity_type] = [];
    }

    eventTimesByActivity[row.activity_type].push({
      eventTime: row.event_time,
      shart: Boolean(row.shart),
      vitaminD: Boolean(row.vitamin_d),
      breastSide: row.breast_side || '',
    });
  }
  const feedStatsRows = db.prepare(`
    SELECT
      activity_type,
      COUNT(*) AS count,
      SUM(CASE WHEN amount_value IS NOT NULL THEN 1 ELSE 0 END) AS known_volume_count,
      SUM(CASE WHEN amount_value IS NULL THEN 1 ELSE 0 END) AS missing_volume_count,
      SUM(
        CASE
          WHEN amount_value IS NULL THEN 0
          WHEN LOWER(COALESCE(amount_unit, '')) = 'oz' THEN amount_value * ?
          ELSE amount_value
        END
      ) AS total_amount_ml
    FROM arlo_events
    WHERE event_date = ?
      AND activity_type IN ('breastfeeding', 'stored-breast-milk', 'colostrum', 'formula', 'gripe-water')
    GROUP BY activity_type
  `).all(OUNCES_TO_ML, date);

  const feedStats = {};
  let knownFeedVolumeMl = 0;
  let knownVolumeFeedCount = 0;
  let missingVolumeFeedCount = 0;
  for (const row of feedStatsRows) {
    const totalAmountMl = Number(row.total_amount_ml || 0);
    const knownVolumeCount = Number(row.known_volume_count || 0);
    const missingVolumeCount = Number(row.missing_volume_count || 0);
    feedStats[row.activity_type] = {
      count: Number(row.count || 0),
      knownVolumeCount,
      missingVolumeCount,
      totalAmountMl,
    };
    knownFeedVolumeMl += totalAmountMl;
    knownVolumeFeedCount += knownVolumeCount;
    missingVolumeFeedCount += missingVolumeCount;
  }

  return {
    date,
    counts,
    latestByActivity,
    eventTimesByActivity,
    feedStats,
    knownFeedVolumeMl,
    knownVolumeFeedCount,
    missingVolumeFeedCount,
  };
}

function computeArloFuelGauge(now, tauHours = ARLO_FUEL_DEFAULT_TAU_HOURS) {
  const history = getArloFeedHistory(now, ARLO_FUEL_LOOKBACK_DAYS);
  return buildArloFuelGaugePayload(now, history, tauHours);
}

function getArloFeedHistory(now, lookbackDays = ARLO_FUEL_LOOKBACK_DAYS) {
  const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const startDate = formatDateInTimeZone(start, ARLO_TIME_ZONE);
  const endDate = formatDateInTimeZone(now, ARLO_TIME_ZONE);
  const rows = db.prepare(`
    SELECT id, activity_type, event_date, event_time, amount_value, amount_unit, vitamin_d, breast_side, created_at
    FROM arlo_events
    WHERE event_date BETWEEN ? AND ?
      AND activity_type IN ('breastfeeding', 'stored-breast-milk', 'colostrum', 'formula')
    ORDER BY event_date ASC, event_time ASC, id ASC
  `).all(startDate, endDate);

  const baseFeeds = rows.map((row) => normalizeArloFeedRow(row)).filter(Boolean);
  const knownAmounts = baseFeeds
    .map((feed) => feed.rawAmountMl)
    .filter((amountMl) => Number.isFinite(amountMl) && amountMl > 0 && amountMl <= ARLO_MAX_REASONABLE_FEED_ML);
  const inferredAverageMl = knownAmounts.length
    ? knownAmounts.reduce((sum, amountMl) => sum + amountMl, 0) / knownAmounts.length
    : null;

  return baseFeeds.map((feed) => applyArloInferredAmount(feed, inferredAverageMl));
}

function normalizeArloFeedRow(row) {
  const timestamp = parseArloEventTimestamp(row.event_date, row.event_time);
  if (!timestamp) {
    return null;
  }

  const amountMl = convertArloAmountToMl(row.amount_value, row.amount_unit);
  const isKnownAmount = Number.isFinite(amountMl);
  const hasValidKnownAmount = isKnownAmount && amountMl > 0 && amountMl <= ARLO_MAX_REASONABLE_FEED_ML;
  const amountIssue = !isKnownAmount
    ? 'missing_amount'
    : amountMl <= 0
      ? 'zero_amount'
      : amountMl > ARLO_MAX_REASONABLE_FEED_ML
        ? 'amount_outlier'
        : null;

  return {
    id: row.id,
    activityType: row.activity_type,
    eventDate: row.event_date,
    eventTime: row.event_time,
    timestamp: timestamp.toISOString(),
    timestampMs: timestamp.getTime(),
    displayTimestamp: `${row.event_date} ${row.event_time}`,
    amountMl: hasValidKnownAmount ? roundToOneDecimal(amountMl) : null,
    rawAmountMl: isKnownAmount ? roundToOneDecimal(amountMl) : null,
    amountIssue,
    isKnownAmount,
    hasValidKnownAmount,
    isValidAmount: hasValidKnownAmount,
    amountSource: hasValidKnownAmount ? 'logged' : 'missing',
    vitaminD: Boolean(row.vitamin_d),
    breastSide: row.breast_side || '',
    createdAt: row.created_at,
  };
}

function applyArloInferredAmount(feed, inferredAverageMl) {
  if (!feed) {
    return null;
  }

  if (feed.hasValidKnownAmount) {
    return feed;
  }

  if (feed.amountIssue !== 'missing_amount' || !(inferredAverageMl > 0)) {
    return feed;
  }

  return {
    ...feed,
    amountMl: roundToOneDecimal(inferredAverageMl),
    isValidAmount: true,
    amountSource: 'inferred',
  };
}

function buildArloFuelGaugePayload(now, feedHistory, tauHours) {
  const validFeeds = feedHistory.filter((feed) => feed.isValidAmount && feed.timestampMs <= now.getTime());
  const recentValidFeeds = validFeeds.filter((feed) => (now.getTime() - feed.timestampMs) <= ARLO_FUEL_RECENT_WINDOW_HOURS * 60 * 60 * 1000);
  const latestFeed = getLastMatchingFeed(feedHistory, (feed) => feed.timestampMs <= now.getTime());
  const latestGaugeFeed = getLastMatchingFeed(validFeeds, (feed) => feed.timestampMs <= now.getTime());
  const lastThreeFeeds = [...validFeeds].slice(-3).reverse().map((feed) => buildRecentFeedSnapshot(feed, now, tauHours));
  const invalidFeeds = feedHistory.filter((feed) => feed.amountIssue && !feed.isValidAmount);
  const inferredFeeds = feedHistory.filter((feed) => feed.amountSource === 'inferred');
  const typicalFullLevelMl = computeTypicalFullLevel(validFeeds, tauHours, ARLO_FUEL_FULL_PERCENTILE);
  const typicalDailyMl = computeTypicalDailyTotal(validFeeds);
  const rolling24hMl = computeRolling24hTotal(validFeeds, now);
  const milkOnBoardMl = computeMilkOnBoard(validFeeds, now, tauHours);
  const shortTermGaugePctRaw = typicalFullLevelMl > 0 ? (100 * milkOnBoardMl) / typicalFullLevelMl : null;
  const dailyGaugePctRaw = typicalDailyMl > 0 ? (100 * rolling24hMl) / typicalDailyMl : null;
  const fullnessScoreRaw = shortTermGaugePctRaw === null || dailyGaugePctRaw === null
    ? null
    : 0.85 * shortTermGaugePctRaw + 0.15 * dailyGaugePctRaw;
  const availability = getArloFuelGaugeAvailability({
    feedHistory,
    validFeeds,
    recentValidFeeds,
    typicalFullLevelMl,
    typicalDailyMl,
  });
  const warnings = buildArloFuelGaugeWarnings({ latestFeed, invalidFeeds, inferredFeeds, recentValidFeeds, latestGaugeFeed });
  const recentContributions = buildRecentFeedContributions(validFeeds, now, tauHours);
  const backtest = backtestArloHungerScores(validFeeds, ARLO_FUEL_TAU_OPTIONS);

  if (!availability.available || fullnessScoreRaw === null) {
    return {
      as_of: now.toISOString(),
      mode: 'arlo',
      component: 'fuel_gauge',
      available: false,
      message: availability.message,
      tau_hours: tauHours,
      tau_options_hours: ARLO_FUEL_TAU_OPTIONS,
      warnings,
      inferred_feed_count: inferredFeeds.length,
      ignored_feed_count: invalidFeeds.length,
      ignored_feeds: invalidFeeds.map((feed) => ({
        timestamp: feed.timestamp,
        activity_type: feed.activityType,
        raw_amount_ml: feed.rawAmountMl,
        amount_issue: feed.amountIssue,
      })),
      last_feed: latestGaugeFeed ? buildLastFeedPayload(latestGaugeFeed, now) : (latestFeed ? buildLastFeedPayload(latestFeed, now) : null),
      recent_feeds: recentContributions,
      recent_feed_snapshots: lastThreeFeeds,
      last_3_feeds: lastThreeFeeds,
      backtest,
    };
  }

  const projectedOptions = computeProjectedFeedOptions(now, validFeeds, {
    tauHours,
    typicalFullLevelMl,
    typicalDailyMl,
    rolling24hMl,
    optionsMl: ARLO_SIMULATED_FEED_OPTIONS_ML,
  });
  const recommendation = getArloRecommendation(fullnessScoreRaw);

  return {
    as_of: now.toISOString(),
    mode: 'arlo',
    component: 'fuel_gauge',
    available: true,
    fullness_score: roundToOneDecimal(clamp(fullnessScoreRaw, 0, 150)),
    display_fullness_score: Math.round(clamp(fullnessScoreRaw, 0, 100)),
    hunger_score: roundToOneDecimal(clamp(100 - fullnessScoreRaw, 0, 100)),
    milk_on_board_ml: roundToOneDecimal(milkOnBoardMl),
    short_term_gauge_pct: roundToOneDecimal(shortTermGaugePctRaw),
    short_term_gauge_pct_uncapped: roundToOneDecimal(shortTermGaugePctRaw),
    rolling_24h_ml: roundToOneDecimal(rolling24hMl),
    daily_gauge_pct: roundToOneDecimal(dailyGaugePctRaw),
    typical_full_level_ml: roundToOneDecimal(typicalFullLevelMl),
    typical_daily_ml: roundToOneDecimal(typicalDailyMl),
    tau_hours: tauHours,
    tau_options_hours: ARLO_FUEL_TAU_OPTIONS,
    recommendation,
    last_feed: latestGaugeFeed ? buildLastFeedPayload(latestGaugeFeed, now) : (latestFeed ? buildLastFeedPayload(latestFeed, now) : null),
    recent_feeds: recentContributions,
    recent_feed_snapshots: lastThreeFeeds,
    last_3_feeds: lastThreeFeeds,
    simulated_feed_options: projectedOptions,
    warnings,
    inferred_feed_count: inferredFeeds.length,
    ignored_feed_count: invalidFeeds.length,
    ignored_feeds: invalidFeeds.map((feed) => ({
      timestamp: feed.timestamp,
      activity_type: feed.activityType,
      raw_amount_ml: feed.rawAmountMl,
      amount_issue: feed.amountIssue,
    })),
    backtest,
  };
}

function getArloFuelGaugeAvailability({ feedHistory, validFeeds, recentValidFeeds, typicalFullLevelMl, typicalDailyMl }) {
  if (!feedHistory.length) {
    return { available: false, message: 'Not enough recent feeding data yet.' };
  }

  if (!recentValidFeeds.length) {
    return { available: false, message: 'Not enough recent feeding data yet.' };
  }

  if (validFeeds.length < 4) {
    return { available: false, message: 'Not enough recent feeding data yet.' };
  }

  if (!(typicalFullLevelMl > 0) || !(typicalDailyMl > 0)) {
    return { available: false, message: 'Not enough recent feeding data yet.' };
  }

  return { available: true, message: '' };
}

function buildArloFuelGaugeWarnings({ latestFeed, latestGaugeFeed, invalidFeeds, inferredFeeds, recentValidFeeds }) {
  const warnings = [];

  if (latestFeed && !latestFeed.isValidAmount) {
    warnings.push('Last feed has no usable mL amount, so it was excluded from the gauge.');
  }

  if (inferredFeeds.length) {
    warnings.push(`${inferredFeeds.length} feed${inferredFeeds.length === 1 ? '' : 's'} used inferred mL based on average known feed volume.`);
  }

  if (invalidFeeds.length) {
    warnings.push(`${invalidFeeds.length} feed${invalidFeeds.length === 1 ? '' : 's'} were ignored because the mL amount was missing, zero, or suspicious.`);
  }

  if (latestFeed && latestGaugeFeed && latestFeed.id !== latestGaugeFeed.id) {
    warnings.push('The most recent logged feed could not be used directly, so the gauge is anchored to the latest feed with usable or inferred volume.');
  }

  if (!recentValidFeeds.length) {
    warnings.push('No valid milk feeds were logged in the last 24 hours.');
  }

  return warnings;
}

function computeMilkOnBoard(feeds, now, tauHours = ARLO_FUEL_DEFAULT_TAU_HOURS, additionalMl = 0) {
  if (!(tauHours > 0)) {
    return 0;
  }

  const nowMs = now.getTime();
  let total = 0;
  for (const feed of feeds) {
    if (!feed.isValidAmount || feed.timestampMs > nowMs) {
      continue;
    }

    const hoursSinceFeed = (nowMs - feed.timestampMs) / (1000 * 60 * 60);
    total += feed.amountMl * Math.exp(-hoursSinceFeed / tauHours);
  }

  if (additionalMl > 0) {
    total += additionalMl;
  }

  return total;
}

function computeRolling24hTotal(feeds, now) {
  const cutoffMs = now.getTime() - 24 * 60 * 60 * 1000;
  return feeds.reduce((sum, feed) => {
    if (!feed.isValidAmount || feed.timestampMs > now.getTime() || feed.timestampMs < cutoffMs) {
      return sum;
    }
    return sum + feed.amountMl;
  }, 0);
}

function computeTypicalDailyTotal(feeds) {
  const totalsByDay = new Map();
  for (const feed of feeds) {
    if (!feed.isValidAmount) {
      continue;
    }
    totalsByDay.set(feed.eventDate, (totalsByDay.get(feed.eventDate) || 0) + feed.amountMl);
  }

  return median([...totalsByDay.values()]);
}

function computeTypicalFullLevel(feeds, tauHours = ARLO_FUEL_DEFAULT_TAU_HOURS, percentile = ARLO_FUEL_FULL_PERCENTILE) {
  const postFeedLevels = [];
  for (const feed of feeds) {
    if (!feed.isValidAmount) {
      continue;
    }
    postFeedLevels.push(computeMilkOnBoard(feeds, new Date(feed.timestampMs), tauHours));
  }

  return percentileValue(postFeedLevels, percentile);
}

function computeProjectedFeedOptions(now, feeds, { tauHours, typicalFullLevelMl, typicalDailyMl, rolling24hMl, optionsMl }) {
  return optionsMl.map((additionalMl) => {
    const milkOnBoardMl = computeMilkOnBoard(feeds, now, tauHours, additionalMl);
    const shortTermGaugePct = typicalFullLevelMl > 0 ? (100 * milkOnBoardMl) / typicalFullLevelMl : 0;
    const dailyGaugePct = typicalDailyMl > 0 ? (100 * (rolling24hMl + additionalMl)) / typicalDailyMl : 0;
    const fullnessScore = 0.85 * shortTermGaugePct + 0.15 * dailyGaugePct;

    return {
      additional_ml: additionalMl,
      projected_fullness_score: roundToOneDecimal(clamp(fullnessScore, 0, 150)),
      projected_recommendation: getArloRecommendation(fullnessScore),
    };
  });
}

function backtestArloHungerScores(feeds, tauHoursValues = ARLO_FUEL_TAU_OPTIONS) {
  const results = [];

  for (const tauHours of tauHoursValues) {
    const typicalFullLevelMl = computeTypicalFullLevel(feeds, tauHours, ARLO_FUEL_FULL_PERCENTILE);
    const typicalDailyMl = computeTypicalDailyTotal(feeds);
    const snapshots = [];

    if (!(typicalFullLevelMl > 0) || !(typicalDailyMl > 0)) {
      results.push({
        tau_hours: tauHours,
        sample_size: 0,
        message: 'Not enough data to backtest this tau.',
      });
      continue;
    }

    for (const feed of feeds) {
      if (!feed.isValidAmount) {
        continue;
      }

      const eventNow = new Date(feed.timestampMs - 1000);
      const milkOnBoardMl = computeMilkOnBoard(feeds, eventNow, tauHours);
      const rolling24hMl = computeRolling24hTotal(feeds, eventNow);
      const shortTermGaugePct = (100 * milkOnBoardMl) / typicalFullLevelMl;
      const dailyGaugePct = (100 * rolling24hMl) / typicalDailyMl;
      const fullnessScore = 0.85 * shortTermGaugePct + 0.15 * dailyGaugePct;
      const hungerScore = clamp(100 - fullnessScore, 0, 100);

      snapshots.push({
        amountMl: feed.amountMl,
        fullnessScore,
        hungerScore,
      });
    }

    const largeFeeds = snapshots.filter((snapshot) => snapshot.amountMl >= 100);
    const smallTopOffs = snapshots.filter((snapshot) => snapshot.amountMl < 60);
    const hungerScores = snapshots.map((snapshot) => snapshot.hungerScore);

    results.push({
      tau_hours: tauHours,
      sample_size: snapshots.length,
      median_fullness_score_before_feeds: roundToOneDecimal(median(snapshots.map((snapshot) => snapshot.fullnessScore))),
      median_hunger_score_before_feeds: roundToOneDecimal(median(hungerScores)),
      median_hunger_score_before_large_feeds: roundToOneDecimal(median(largeFeeds.map((snapshot) => snapshot.hungerScore))),
      median_hunger_score_before_small_topoffs: roundToOneDecimal(median(smallTopOffs.map((snapshot) => snapshot.hungerScore))),
      hunger_score_distribution: {
        under_25: hungerScores.filter((value) => value < 25).length,
        between_25_and_50: hungerScores.filter((value) => value >= 25 && value < 50).length,
        between_50_and_75: hungerScores.filter((value) => value >= 50 && value < 75).length,
        over_75: hungerScores.filter((value) => value >= 75).length,
      },
    });
  }

  return results;
}

function buildRecentFeedContributions(feeds, now, tauHours) {
  const nowMs = now.getTime();
  return feeds
    .filter((feed) => feed.timestampMs <= nowMs && (nowMs - feed.timestampMs) <= ARLO_FUEL_RECENT_WINDOW_HOURS * 60 * 60 * 1000)
    .map((feed) => {
      const hoursAgo = (nowMs - feed.timestampMs) / (1000 * 60 * 60);
      return {
        timestamp: feed.timestamp,
        display_timestamp: feed.displayTimestamp,
        event_date: feed.eventDate,
        event_time: feed.eventTime,
        amount_ml: feed.amountMl,
        hours_ago: roundToOneDecimal(hoursAgo),
        contribution_ml: roundToOneDecimal(feed.amountMl * Math.exp(-hoursAgo / tauHours)),
        activity_type: feed.activityType,
        amount_source: feed.amountSource,
      };
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function buildLastFeedPayload(feed, now) {
  return {
    timestamp: feed.timestamp,
    display_timestamp: feed.displayTimestamp,
    event_date: feed.eventDate,
    event_time: feed.eventTime,
    amount_ml: feed.amountMl,
    activity_type: feed.activityType,
    minutes_ago: Math.max(0, Math.round((now.getTime() - feed.timestampMs) / 60000)),
    amount_source: feed.amountSource,
  };
}

function buildRecentFeedSnapshot(feed, now, tauHours) {
  const hoursAgo = (now.getTime() - feed.timestampMs) / (1000 * 60 * 60);
  return {
    timestamp: feed.timestamp,
    display_timestamp: feed.displayTimestamp,
    event_date: feed.eventDate,
    event_time: feed.eventTime,
    amount_ml: feed.amountMl,
    minutes_ago: Math.max(0, Math.round((now.getTime() - feed.timestampMs) / 60000)),
    contribution_ml: roundToOneDecimal(feed.amountMl * Math.exp(-hoursAgo / tauHours)),
    amount_source: feed.amountSource,
  };
}

function getLastMatchingFeed(feeds, predicate) {
  for (let index = feeds.length - 1; index >= 0; index -= 1) {
    if (predicate(feeds[index])) {
      return feeds[index];
    }
  }
  return null;
}

function getArloRecommendation(fullnessScore) {
  if (!(fullnessScore >= 0)) {
    return 'Not enough recent feeding data yet.';
  }
  if (fullnessScore < 30) {
    return 'Likely ready for a full feed if showing hunger cues.';
  }
  if (fullnessScore < 55) {
    return 'Could be hungry; consider a normal feed or partial feed depending on cues.';
  }
  if (fullnessScore < 75) {
    return 'Middle zone — consider a small top-off if hunger cues continue.';
  }
  if (fullnessScore <= 100) {
    return 'Recently well-fed; try burping, upright time, pacifier, or soothing first.';
  }
  return 'Above typical full level; avoid another full feed unless hunger cues are very strong.';
}

function normalizeArloTauHours(value) {
  const tauHours = Number(value);
  if (!Number.isFinite(tauHours)) {
    return ARLO_FUEL_DEFAULT_TAU_HOURS;
  }

  const matchedOption = ARLO_FUEL_TAU_OPTIONS.find((option) => Math.abs(option - tauHours) < 0.001);
  return matchedOption || ARLO_FUEL_DEFAULT_TAU_HOURS;
}

function convertArloAmountToMl(amountValue, amountUnit) {
  const amount = Number(amountValue);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return String(amountUnit || '').toLowerCase() === 'oz'
    ? amount * OUNCES_TO_ML
    : amount;
}

function parseArloEventTimestamp(eventDate, eventTime) {
  if (!eventDate || !eventTime) {
    return null;
  }

  const timestamp = new Date(`${eventDate}T${eventTime}:00`);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp;
}

function percentileValue(values, percentile) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) {
    return 0;
  }

  const rank = (clamp(percentile, 0, 100) / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = rank - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

function median(values) {
  return percentileValue(values, 50);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function roundToOneDecimal(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 10) / 10;
}

function recordArloEvent(payload) {
  const activityType = normalizeArloActivityType(payload.activityType);
  const eventDate = normalizeEventDate(payload.eventDate);
  const eventTime = normalizeEventTime(payload.eventTime);
  const amountValue = normalizeArloAmount(payload.amountValue, activityType);
  const amountUnit = normalizeArloAmountUnit(payload.amountUnit, amountValue);
  const poopColor = normalizePoopColor(payload.poopColor, activityType);
  const shart = normalizeShart(payload.shart, activityType);
  const vitaminD = normalizeVitaminD(payload.vitaminD, activityType);
  const breastSide = normalizeBreastSide(payload.breastSide, activityType);

  db.prepare(`
    INSERT INTO arlo_events (activity_type, event_date, event_time, amount_value, amount_unit, poop_color, shart, vitamin_d, breast_side)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(activityType, eventDate, eventTime, amountValue, amountUnit, poopColor, shart ? 1 : 0, vitaminD ? 1 : 0, breastSide);
}

function deleteArloEvent(eventId) {
  if (!Number.isInteger(eventId)) {
    throw new Error('A valid Arlo event id is required.');
  }

  const existing = db.prepare('SELECT id FROM arlo_events WHERE id = ?').get(eventId);
  if (!existing) {
    throw new Error('Arlo event not found.');
  }

  db.prepare('DELETE FROM arlo_events WHERE id = ?').run(eventId);
}

function normalizeArloActivityType(value) {
  const normalized = String(value || '').trim();
  const allowed = new Set([
    'breastfeeding',
    'stored-breast-milk',
    'colostrum',
    'formula',
    'gripe-water',
    'poop-diaper',
    'pee-diaper',
    'both-diaper',
  ]);

  if (!allowed.has(normalized)) {
    throw new Error('Choose a valid Arlo activity.');
  }

  return normalized;
}

function normalizeEventDate(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('Choose a valid day.');
  }

  return normalized;
}

function normalizeEventTime(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error('Choose a valid time.');
  }

  return normalized;
}

function normalizeArloAmount(value, activityType) {
  const requiresNoAmount = new Set(['poop-diaper', 'pee-diaper', 'both-diaper']);
  const raw = String(value ?? '').trim();

  if (requiresNoAmount.has(activityType)) {
    return null;
  }

  if (!raw) {
    return null;
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Enter a valid amount or leave it blank.');
  }

  return amount;
}

function normalizeArloAmountUnit(value, amountValue) {
  if (amountValue === null) {
    return null;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!['oz', 'ml'].includes(normalized)) {
    throw new Error('Choose a valid amount unit.');
  }

  return normalized;
}

function normalizePoopColor(value, activityType) {
  const supportsPoopColor = new Set(['poop-diaper', 'both-diaper']);
  if (!supportsPoopColor.has(activityType)) {
    return null;
  }

  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 40) : null;
}

function normalizeVitaminD(value, activityType) {
  const supportsVitaminD = new Set(['breastfeeding', 'stored-breast-milk', 'colostrum', 'formula']);
  if (!supportsVitaminD.has(activityType)) {
    return false;
  }

  return Boolean(value);
}

function normalizeShart(value, activityType) {
  const supportsShart = new Set(['poop-diaper', 'both-diaper']);
  if (!supportsShart.has(activityType)) {
    return false;
  }

  return Boolean(value);
}

function normalizeBreastSide(value, activityType) {
  if (activityType !== 'breastfeeding') {
    return null;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const allowed = new Set(['left', 'right', 'both']);
  if (!allowed.has(normalized)) {
    throw new Error('Choose a valid breastfeeding side.');
  }

  return normalized;
}

function formatDateInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function resolveSelectedSlugs(rawSelectedUsers, users) {
  const allSlugs = users.map((user) => user.slug);
  const submittedValues = Array.isArray(rawSelectedUsers) ? rawSelectedUsers : [rawSelectedUsers];
  const submittedSlugs = submittedValues
    .flatMap((value) => String(value || '').split(','))
    .map((value) => normalizeSlug(value))
    .filter(Boolean);

  if (!submittedSlugs.length) {
    return allSlugs;
  }

  return allSlugs.filter((slug) => submittedSlugs.includes(slug));
}

function queueSummaryRefreshForAllNames() {
  const names = db.prepare(`
    SELECT id, wiki_status, wiki_updated_at
    FROM names
    ORDER BY id
  `).all();

  for (const name of names) {
    if (needsSummaryRefresh(name)) {
      enqueueSummaryRefresh(name.id);
    }
  }
}

function queueSummaryRefreshForNames(names) {
  for (const name of names) {
    if (name && Number.isInteger(name.id)) {
      enqueueSummaryRefresh(name.id);
    }
  }
}

function enqueueSummaryRefresh(nameId) {
  if (queuedSummaryIds.has(nameId)) {
    return;
  }

  queuedSummaryIds.add(nameId);
  summaryQueue.push(nameId);
  void processSummaryQueue();
}

async function processSummaryQueue() {
  if (isRefreshingSummaries) {
    return;
  }

  isRefreshingSummaries = true;

  while (summaryQueue.length) {
    const nameId = summaryQueue.shift();
    queuedSummaryIds.delete(nameId);

    try {
      await refreshNameSummary(nameId);
    } catch (error) {
      console.error(`Unable to refresh summary for name ${nameId}:`, error);
    }

    await delay(SUMMARY_FETCH_DELAY_MS);
  }

  isRefreshingSummaries = false;
}

async function refreshNameSummary(nameId) {
  const entry = db.prepare(`
    SELECT id, name, wiki_status, wiki_updated_at
    FROM names
    WHERE id = ?
  `).get(nameId);

  if (!entry || !needsSummaryRefresh(entry)) {
    return;
  }

  const summary = await fetchWikipediaSummary(entry.name);

  db.prepare(`
    UPDATE names
    SET wiki_summary = ?,
        wiki_source_url = ?,
        wiki_status = ?,
        wiki_updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(summary.summary, summary.sourceUrl, summary.status, nameId);
}

function needsSummaryRefresh(entry) {
  if (!entry) {
    return false;
  }

  if (!entry.wiki_updated_at) {
    return true;
  }

  const updatedAt = Date.parse(entry.wiki_updated_at);
  if (Number.isNaN(updatedAt)) {
    return true;
  }

  return Date.now() - updatedAt > SUMMARY_REFRESH_INTERVAL_MS;
}

async function fetchWikipediaSummary(name) {
  const titles = [`${name}_(given_name)`, `${name}_(name)`, name];

  for (const title of titles) {
    const payload = await fetchWikipediaSummaryPayload(title);
    if (!payload || !isUsefulNameSummary(payload, title, name)) {
      continue;
    }

    const extract = cleanSummary(payload.extract);
    if (!extract) {
      continue;
    }

    return {
      summary: extract,
      sourceUrl: payload.content_urls?.desktop?.page || payload.content_urls?.mobile?.page || '',
      status: 'ready',
    };
  }

  return {
    summary: '',
    sourceUrl: '',
    status: 'missing',
  };
}

async function fetchWikipediaSummaryPayload(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pairwise-baby/1.0 (name summary fetch)',
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (_error) {
    return null;
  }
}

function isUsefulNameSummary(payload, requestedTitle, name) {
  const canonical = String(payload?.titles?.canonical || payload?.title || '').replace(/ /g, '_');
  const requested = requestedTitle.replace(/ /g, '_');
  const normalizedName = name.toLowerCase();
  const canonicalLower = canonical.toLowerCase();
  const extractLower = String(payload?.extract || '').toLowerCase();

  if (!canonical || payload?.type === 'disambiguation' || extractLower.includes('may refer to')) {
    return false;
  }

  if (requested.endsWith('_(given_name)') || requested.endsWith('_(name)')) {
    return canonicalLower === requested.toLowerCase();
  }

  return canonicalLower === normalizedName || canonicalLower.startsWith(`${normalizedName}_(`);
}

function cleanSummary(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const shortText = sentences.slice(0, 2).join(' ').trim();
  const clipped = shortText.length > 180 ? `${shortText.slice(0, 177).trimEnd()}...` : shortText;
  return clipped;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
