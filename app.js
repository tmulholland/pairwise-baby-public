const elements = {
  userForm: document.querySelector('#user-form'),
  userSlug: document.querySelector('#user-slug'),
  currentUserHeading: document.querySelector('#current-user-heading'),
  currentUserPill: document.querySelector('#current-user-pill'),
  activeUserInline: document.querySelector('#active-user-inline'),
  userList: document.querySelector('#user-list'),
  bulkAddForm: document.querySelector('#bulk-add-form'),
  bulkNames: document.querySelector('#bulk-names'),
  singleAddForm: document.querySelector('#single-add-form'),
  singleName: document.querySelector('#single-name'),
  matchupState: document.querySelector('#matchup-state'),
  matchup: document.querySelector('#matchup'),
  choiceLeft: document.querySelector('#choice-left'),
  choiceRight: document.querySelector('#choice-right'),
  skipPair: document.querySelector('#skip-pair'),
  comparisonCount: document.querySelector('#comparison-count'),
  nameCount: document.querySelector('#name-count'),
  nameList: document.querySelector('#name-list'),
  personalRankingUser: document.querySelector('#personal-ranking-user'),
  personalRankingSummary: document.querySelector('#personal-ranking-summary'),
  personalRankingList: document.querySelector('#personal-ranking-list'),
};

const state = {
  activeUser: getUserSlugFromPath(),
  users: [],
  names: [],
  rankings: [],
};

let currentPair = null;

bindEvents();
loadState();

function bindEvents() {
  elements.userForm.addEventListener('submit', handleUserSubmit);
  elements.bulkAddForm.addEventListener('submit', handleBulkAdd);
  elements.singleAddForm.addEventListener('submit', handleSingleAdd);
  elements.choiceLeft.addEventListener('click', () => submitComparison(currentPair ? currentPair.leftId : null));
  elements.choiceRight.addEventListener('click', () => submitComparison(currentPair ? currentPair.rightId : null));
  elements.skipPair.addEventListener('click', () => {
    currentPair = null;
    renderMatchup();
  });
}

async function loadState() {
  setLoading(true);

  try {
    const payload = await apiFetchJson(`/api/state/${encodeURIComponent(state.activeUser)}`);
    applyState(payload);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

async function handleUserSubmit(event) {
  event.preventDefault();
  const slug = normalizeSlug(elements.userSlug.value);

  if (!slug) {
    return;
  }

  try {
    const payload = await apiFetchJson('/api/users', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
    window.location.href = `/${payload.user.slug}`;
  } catch (error) {
    showError(error.message);
  }
}

async function handleBulkAdd(event) {
  event.preventDefault();
  const names = elements.bulkNames.value.split('\n').map(cleanName).filter(Boolean);

  if (!names.length) {
    return;
  }

  await addNames(names);
  elements.bulkNames.value = '';
}

async function handleSingleAdd(event) {
  event.preventDefault();
  const name = cleanName(elements.singleName.value);

  if (!name) {
    return;
  }

  await addNames([name]);
  elements.singleName.value = '';
}

async function addNames(names) {
  try {
    const payload = await apiFetchJson('/api/names', {
      method: 'POST',
      body: JSON.stringify({ names, userSlug: state.activeUser }),
    });
    applyState(payload.state);
  } catch (error) {
    showError(error.message);
  }
}

async function deleteName(nameId, name) {
  const confirmed = window.confirm(`Delete ${name} from the shared name pool? This removes it from every user's rankings and comparison history.`);

  if (!confirmed) {
    return;
  }

  try {
    const payload = await apiFetchJson(`/api/names/${nameId}?userSlug=${encodeURIComponent(state.activeUser)}`, {
      method: 'DELETE',
    });
    applyState(payload.state);
  } catch (error) {
    showError(error.message);
  }
}

async function submitComparison(winnerId) {
  if (!currentPair || !winnerId) {
    return;
  }

  const loserId = winnerId === currentPair.leftId ? currentPair.rightId : currentPair.leftId;

  try {
    const payload = await apiFetchJson('/api/comparisons', {
      method: 'POST',
      body: JSON.stringify({
        userSlug: state.activeUser,
        winnerId,
        loserId,
      }),
    });
    applyState(payload.state);
  } catch (error) {
    showError(error.message);
  }
}

async function apiFetchJson(url, options) {
  const requestOptions = options || {};
  const headers = {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };

  if (requestOptions.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...requestOptions,
    headers: {
      ...headers,
      ...(requestOptions.headers || {}),
    },
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error('The server returned a non-JSON response. If you are using the ngrok URL, refresh once and try again.');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'The request failed.');
  }

  return payload;
}

function applyState(payload) {
  state.activeUser = payload.activeUser;
  state.users = payload.users;
  state.names = payload.names;
  state.rankings = payload.rankings;
  currentPair = null;
  render();
}

function render() {
  renderHeader();
  renderUsers();
  renderNames();
  renderMatchup();
  renderPersonalRanking();
}

function renderHeader() {
  const label = `/${state.activeUser}`;
  elements.currentUserHeading.textContent = label;
  elements.currentUserPill.textContent = 'SQLite-backed';
  elements.activeUserInline.textContent = label;
  elements.personalRankingUser.textContent = label;
}

function renderUsers() {
  elements.userList.innerHTML = '';

  for (const user of state.users) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/${user.slug}`;
    link.textContent = `/${user.slug}`;
    link.className = user.slug === state.activeUser ? 'user-link active' : 'user-link';
    item.append(link);
    elements.userList.append(item);
  }
}

function renderNames() {
  elements.nameList.innerHTML = '';
  elements.nameCount.textContent = `${state.names.length} ${state.names.length === 1 ? 'name' : 'names'}`;

  for (const entry of state.names) {
    const item = document.createElement('li');
    item.className = 'name-list-item';

    const label = document.createElement('span');
    label.className = 'name-list-label';
    label.textContent = entry.name;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'name-delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      deleteName(entry.id, entry.name);
    });

    item.append(label, deleteButton);
    elements.nameList.append(item);
  }
}

function renderMatchup() {
  const enoughNames = state.names.length >= 2;
  const activeRanking = getActiveRanking();
  elements.matchup.classList.toggle('hidden', !enoughNames);
  elements.matchupState.classList.toggle('hidden', enoughNames);

  if (!enoughNames) {
    elements.matchupState.innerHTML = '<p>Add at least two names to start comparing.</p>';
    elements.comparisonCount.textContent = '0 comparisons recorded';
    return;
  }

  if (!currentPair || !hasPairInNamePool(currentPair)) {
    currentPair = chooseRandomPair();
  }

  const left = state.names.find((entry) => entry.id === currentPair.leftId);
  const right = state.names.find((entry) => entry.id === currentPair.rightId);

  elements.choiceLeft.textContent = left.name;
  elements.choiceRight.textContent = right.name;
  const comparisonCount = activeRanking ? activeRanking.comparisonCount : 0;
  elements.comparisonCount.textContent = `${comparisonCount} comparison${comparisonCount === 1 ? '' : 's'} recorded`;
}

function renderPersonalRanking() {
  const activeRanking = getActiveRanking();
  elements.personalRankingList.innerHTML = '';

  if (!activeRanking) {
    elements.personalRankingSummary.textContent = '0 picks';
    const empty = document.createElement('li');
    const emptyName = document.createElement('span');
    const emptyScore = document.createElement('span');
    emptyName.className = 'ranking-name';
    emptyScore.className = 'ranking-score';
    emptyName.textContent = 'No ranking yet';
    emptyScore.textContent = 'Compare names to build your order.';
    empty.append(emptyName, emptyScore);
    elements.personalRankingList.append(empty);
    return;
  }

  elements.personalRankingSummary.textContent = `${activeRanking.comparisonCount} picks`;

  if (!activeRanking.names.length) {
    const empty = document.createElement('li');
    const emptyName = document.createElement('span');
    const emptyScore = document.createElement('span');
    emptyName.className = 'ranking-name';
    emptyScore.className = 'ranking-score';
    emptyName.textContent = 'No names yet';
    emptyScore.textContent = 'Add names to begin.';
    empty.append(emptyName, emptyScore);
    elements.personalRankingList.append(empty);
    return;
  }

  for (const entry of activeRanking.names) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const score = document.createElement('span');
    name.className = 'ranking-name';
    score.className = 'ranking-score';
    name.textContent = entry.name;
    score.textContent = `${Math.round(entry.rating)} rating`;
    item.append(name, score);
    elements.personalRankingList.append(item);
  }
}

function getActiveRanking() {
  return state.rankings.find((ranking) => ranking.slug === state.activeUser);
}

function chooseRandomPair() {
  const pool = [...state.names];
  const leftIndex = Math.floor(Math.random() * pool.length);
  const left = pool.splice(leftIndex, 1)[0];
  const right = pool[Math.floor(Math.random() * pool.length)];
  return { leftId: left.id, rightId: right.id };
}

function hasPairInNamePool(pair) {
  return state.names.some((entry) => entry.id === pair.leftId) && state.names.some((entry) => entry.id === pair.rightId);
}

function getUserSlugFromPath() {
  const slug = normalizeSlug(window.location.pathname.replace(/^\/+/, ''));
  return slug || 'troy';
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
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function setLoading(isLoading) {
  elements.currentUserPill.textContent = isLoading ? 'Loading' : 'SQLite-backed';
}

function showError(message) {
  elements.matchup.classList.add('hidden');
  elements.matchupState.classList.remove('hidden');
  elements.matchupState.innerHTML = `<p>${message}</p>`;
}
