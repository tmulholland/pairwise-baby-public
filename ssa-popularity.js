const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SSA_ZIP_URL = 'https://www.ssa.gov/oact/babynames/names.zip';
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_PATH = path.join(CACHE_DIR, 'ssa-popularity-boys.json');
const MIN_SSA_YEAR = 2024;

let cachedYear = null;
let cachedPopularityByName = null;
let refreshPromise = null;

module.exports = {
  ensureNamePopularityColumns,
  initializeSsaPopularity,
  updateSsaPopularityForNames,
};

function ensureNamePopularityColumns(db) {
  const columns = new Set(db.prepare('PRAGMA table_info(names)').all().map((column) => column.name));

  if (!columns.has('ssa_year')) {
    db.exec('ALTER TABLE names ADD COLUMN ssa_year INTEGER');
  }

  if (!columns.has('ssa_births')) {
    db.exec('ALTER TABLE names ADD COLUMN ssa_births INTEGER');
  }

  if (!columns.has('ssa_rank')) {
    db.exec('ALTER TABLE names ADD COLUMN ssa_rank INTEGER');
  }

  if (!columns.has('ssa_updated_at')) {
    db.exec('ALTER TABLE names ADD COLUMN ssa_updated_at TEXT');
  }
}

async function initializeSsaPopularity(db) {
  try {
    await refreshSsaPopularityCache(db);
  } catch (error) {
    console.error('Unable to initialize SSA popularity cache:', error);
  }
}

function updateSsaPopularityForNames(db, names) {
  if (!cachedPopularityByName || !cachedYear || !Array.isArray(names) || !names.length) {
    return;
  }

  applyPopularityToNames(db, names);
}

async function refreshSsaPopularityCache(db) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const cached = readCache();
    const dataset = cached || await downloadPopularityDataset();

    cachedYear = dataset.year;
    cachedPopularityByName = new Map(dataset.names.map((entry) => [entry.name.toLowerCase(), entry]));
    writeCache(dataset);
    applyPopularityToAllNames(db);
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function applyPopularityToAllNames(db) {
  const names = db.prepare('SELECT id, name FROM names ORDER BY id').all();
  applyPopularityToNames(db, names);
}

function applyPopularityToNames(db, names) {
  const update = db.prepare(`
    UPDATE names
    SET ssa_year = ?,
        ssa_births = ?,
        ssa_rank = ?,
        ssa_updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      const popularity = cachedPopularityByName.get(String(row.name || '').toLowerCase());
      update.run(
        cachedYear,
        popularity ? popularity.births : null,
        popularity ? popularity.rank : null,
        row.id
      );
    }
  });

  transaction(names);
}

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Number.isInteger(parsed.year) && parsed.year >= MIN_SSA_YEAR && Array.isArray(parsed.names)) {
      return parsed;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function writeCache(dataset) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(dataset));
}

async function downloadPopularityDataset() {
  const response = await fetch(SSA_ZIP_URL, {
    headers: {
      Accept: 'application/zip',
      'User-Agent': 'pairwise-baby/1.0 (ssa popularity cache)',
    },
  });

  if (!response.ok) {
    throw new Error(`SSA dataset download failed with ${response.status}`);
  }

  const zipBuffer = Buffer.from(await response.arrayBuffer());
  const latestEntry = getLatestYearEntry(zipBuffer);
  const text = extractZipText(zipBuffer, latestEntry);

  if (latestEntry.year < MIN_SSA_YEAR) {
    throw new Error(`Expected SSA data for ${MIN_SSA_YEAR} or newer, received ${latestEntry.year}`);
  }

  if (!text.trim()) {
    throw new Error(`No SSA data found for ${latestEntry.year}`);
  }

  return parsePopularityFile(text, latestEntry.year);
}

function getLatestYearEntry(zipBuffer) {
  const entries = readZipEntries(zipBuffer)
    .map((entry) => {
      const match = /^yob(\d{4})\.txt$/i.exec(entry.name);
      return match ? { ...entry, year: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.year - left.year);

  if (!entries.length) {
    throw new Error('No yearly SSA name files found in names.zip');
  }

  return entries[0];
}

function readZipEntries(zipBuffer) {
  const endOffset = findEndOfCentralDirectory(zipBuffer);
  const entryCount = zipBuffer.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(endOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory.');
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 24);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = zipBuffer.toString('utf8', nameStart, nameStart + fileNameLength);

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(zipBuffer) {
  const minOffset = Math.max(0, zipBuffer.length - 65557);

  for (let offset = zipBuffer.length - 22; offset >= minOffset; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Unable to read SSA ZIP directory.');
}

function extractZipText(zipBuffer, entry) {
  if (zipBuffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header for ${entry.name}`);
  }

  const fileNameLength = zipBuffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = zipBuffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedData = zipBuffer.subarray(dataStart, dataStart + entry.compressedSize);
  let data;

  if (entry.compressionMethod === 0) {
    data = compressedData;
  } else if (entry.compressionMethod === 8) {
    data = zlib.inflateRawSync(compressedData);
  } else {
    throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}`);
  }

  if (data.length !== entry.uncompressedSize) {
    throw new Error(`Unexpected uncompressed size for ${entry.name}`);
  }

  return data.toString('utf8');
}

function parsePopularityFile(text, year) {
  const totalsByName = new Map();

  for (const line of text.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const [name, sex, countText] = line.split(',');
    const births = Number(countText);

    if (!name || sex !== 'M' || !Number.isFinite(births)) {
      continue;
    }

    const key = name.toLowerCase();
    const current = totalsByName.get(key) || { name, births: 0 };
    current.births += births;
    totalsByName.set(key, current);
  }

  const names = [...totalsByName.values()]
    .sort((left, right) => right.births - left.births || left.name.localeCompare(right.name))
    .map((entry, index) => ({
      name: entry.name,
      births: entry.births,
      rank: index + 1,
    }));

  return {
    year,
    names,
    cachedAt: new Date().toISOString(),
    sourceUrl: SSA_ZIP_URL,
  };
}
