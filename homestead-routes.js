const express = require('express');
const path = require('path');
const { groups } = require('./homestead-assets/emoji.json');

const emoji = new Set(groups.flatMap(({ entries }) => entries.map(([icon]) => icon)));
const featureKinds = new Set(['trail', 'creek', 'region']);
const coordinates = (point) => [point?.x, point?.y].every((value) =>
  Number.isFinite(value) && value >= 0 && value <= 1
);
const validName = (name) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80;

function normalizeFeature({ kind, name, points } = {}) {
  const minimum = kind === 'region' ? 3 : 2;
  if (!featureKinds.has(kind) || !validName(name) || !Array.isArray(points) ||
      points.length < minimum || points.length > 1000 || !points.every(coordinates) ||
      new Set(points.map(({ x, y }) => `${x},${y}`)).size < minimum) return null;
  return { kind, name: name.trim(), points: JSON.stringify(points.map(({ x, y }) => ({ x, y }))) };
}

function validPhotos(photos) {
  return Array.isArray(photos) && photos.length <= 6 && photos.every((photo) =>
    typeof photo === 'string' && photo.length <= 700_000 &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(photo)
  );
}

function registerHomestead(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS homestead_landmarks (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      x REAL NOT NULL CHECK (x BETWEEN 0 AND 1),
      y REAL NOT NULL CHECK (y BETWEEN 0 AND 1),
      UNIQUE (name, icon, x, y)
    );
    CREATE TABLE IF NOT EXISTS homestead_landmark_photos (
      landmark_id INTEGER PRIMARY KEY REFERENCES homestead_landmarks(id) ON DELETE CASCADE,
      photos TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homestead_features (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('trail', 'creek', 'region')),
      name TEXT NOT NULL,
      points TEXT NOT NULL,
      UNIQUE (kind, name, points)
    );
  `);
  const listLandmarks = db.prepare('SELECT id, name, icon, x, y FROM homestead_landmarks ORDER BY id');
  const getLandmark = db.prepare(`
    SELECT l.id, l.name, l.icon, l.x, l.y, p.photos
    FROM homestead_landmarks AS l
    LEFT JOIN homestead_landmark_photos AS p ON p.landmark_id = l.id
    WHERE l.id = ?
  `);
  const upsertLandmark = db.prepare(`
    INSERT INTO homestead_landmarks (name, icon, x, y)
    VALUES (@name, @icon, @x, @y)
    ON CONFLICT (name, icon, x, y) DO UPDATE SET name = excluded.name
    RETURNING id
  `);
  const updateLandmark = db.prepare('UPDATE homestead_landmarks SET name = ?, icon = ? WHERE id = ?');
  const removeLandmark = db.prepare('DELETE FROM homestead_landmarks WHERE id = @id AND name = @name AND icon = @icon AND x = @x AND y = @y');
  const removePhotos = db.prepare('DELETE FROM homestead_landmark_photos WHERE landmark_id = ?');
  const deleteLandmark = db.transaction((landmark) => {
    if (!removeLandmark.run(landmark).changes) return !getLandmark.get(landmark.id);
    removePhotos.run(landmark.id);
    return true;
  });
  const savePhotos = db.prepare(`
    INSERT INTO homestead_landmark_photos (landmark_id, photos) VALUES (?, ?)
    ON CONFLICT (landmark_id) DO UPDATE SET photos = excluded.photos
  `);
  const insertFeature = db.prepare(`
    INSERT INTO homestead_features (kind, name, points) VALUES (?, ?, ?)
    ON CONFLICT (kind, name, points) DO NOTHING
  `);
  const listFeatures = db.prepare('SELECT id, kind, name, points FROM homestead_features ORDER BY id');
  const getFeature = db.prepare('SELECT id FROM homestead_features WHERE id = ?');
  const removeFeature = db.prepare('DELETE FROM homestead_features WHERE id = @id AND kind = @kind AND name = @name AND points = @points');
  const deleteFeature = db.transaction((feature) =>
    removeFeature.run(feature).changes > 0 || !getFeature.get(feature.id)
  );
  const readFeatures = () => listFeatures.all().map((row) => ({ ...row, points: JSON.parse(row.points) }));
  const readLandmark = (id) => {
    const row = getLandmark.get(id);
    return row && { ...row, photos: JSON.parse(row.photos ?? '[]') };
  };
  const createLandmarks = db.transaction((landmarks) => {
    for (const { name, icon, x, y, photos } of landmarks) {
      const { id } = upsertLandmark.get({ name: name.trim(), icon, x, y });
      if (photos?.length) {
        const existing = readLandmark(id).photos;
        const combined = [...new Set([...existing, ...photos])];
        if (combined.length > 6) return false;
        savePhotos.run(id, JSON.stringify(combined));
      }
    }
    return true;
  });
  const editLandmark = db.transaction((id, { name, icon, photos, previousPhotos, previousName, previousIcon }) => {
    const current = readLandmark(id);
    if (!current) return 404;
    if (current.name !== previousName || current.icon !== previousIcon ||
        JSON.stringify(current.photos) !== JSON.stringify(previousPhotos)) return 409;
    updateLandmark.run(name.trim(), icon, id);
    savePhotos.run(id, JSON.stringify(photos));
    return 200;
  });

  const api = express.Router();
  api.use(express.json({ limit: '9mb' }));
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/homestead', (_req, res) => res.sendFile(path.join(__dirname, 'homestead.html')));
  app.use('/api/homestead', api);
  api.get('/landmarks', (_req, res) => res.json(listLandmarks.all()));
  api.post('/landmarks', (req, res) => {
    const landmarks = req.body;
    if (!Array.isArray(landmarks) || !landmarks.length || !landmarks.every((landmark) =>
      validName(landmark?.name) && emoji.has(landmark.icon) && coordinates(landmark) &&
      (landmark.photos === undefined || (landmarks.length === 1 && validPhotos(landmark.photos)))
    )) return res.status(400).json({ error: 'Check the landmark name, emoji, map position, and photos.' });
    if (!createLandmarks(landmarks)) return res.status(409).json({ error: 'This landmark already has photos. Open it to edit its gallery.' });
    res.json(listLandmarks.all());
  });
  api.get('/landmarks/:id', (req, res) => {
    const landmark = readLandmark(req.params.id);
    if (!landmark) return res.status(404).json({ error: 'Landmark not found.' });
    res.json(landmark);
  });
  api.put('/landmarks/:id', (req, res) => {
    const landmark = req.body;
    if (!validName(landmark?.name) || !emoji.has(landmark.icon) ||
        !validPhotos(landmark.photos) || !validPhotos(landmark.previousPhotos)) {
      return res.status(400).json({ error: 'Check the landmark name, emoji, and photos.' });
    }
    try {
      const result = editLandmark(req.params.id, landmark);
      if (result === 404) return res.status(404).json({ error: 'Landmark not found.' });
      if (result === 409) return res.status(409).json({ error: 'This landmark changed. Reopen it to get the latest version.' });
      res.json(readLandmark(req.params.id));
    } catch (error) {
      if (error.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw error;
      res.status(409).json({ error: 'A landmark with that name and emoji already exists at this spot.' });
    }
  });
  api.delete('/landmarks/:id', (req, res) => {
    const landmark = req.body;
    if (!validName(landmark?.name) || !emoji.has(landmark.icon) || !coordinates(landmark)) {
      return res.status(400).json({ error: 'Choose a landmark to delete.' });
    }
    const { name, icon, x, y } = landmark;
    if (!deleteLandmark({ id: req.params.id, name, icon, x, y })) {
      return res.status(409).json({ error: 'This landmark changed. Reopen it to get the latest version.' });
    }
    res.json(listLandmarks.all());
  });
  api.get('/features', (_req, res) => res.json(readFeatures()));
  api.post('/features', (req, res) => {
    const feature = normalizeFeature(req.body ?? {});
    if (!feature) {
      return res.status(400).json({ error: 'Enter a name and add enough distinct points to the map.' });
    }
    insertFeature.run(feature.kind, feature.name, feature.points);
    res.json(readFeatures());
  });
  api.delete('/features/:id', (req, res) => {
    const feature = normalizeFeature(req.body ?? {});
    if (!feature) return res.status(400).json({ error: 'Choose a saved shape to delete.' });
    if (!deleteFeature({ id: req.params.id, ...feature })) {
      return res.status(409).json({ error: 'This shape changed. Reload the map and try again.' });
    }
    res.json(readFeatures());
  });
}

module.exports = { registerHomestead };
