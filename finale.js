const USER_CONFIRM_PREFIX = 'finale-confirmed-user:';
const LAST_ACTIVE_USER_KEY = 'finale-last-active-user';
const PRIORITIZE_FEWER_KEY = 'finale-prioritize-fewer-comparisons';

const elements = {
  currentUserHeading: document.querySelector('#current-user-heading'),
  currentUserPill: document.querySelector('#current-user-pill'),
  activeUserInline: document.querySelector('#active-user-inline'),
  firstNameForm: document.querySelector('#first-name-form'),
  firstNameInput: document.querySelector('#first-name-input'),
  middleNameForm: document.querySelector('#middle-name-form'),
  middleNameInput: document.querySelector('#middle-name-input'),
  matchupState: document.querySelector('#matchup-state'),
  matchup: document.querySelector('#matchup'),
  choiceLeft: document.querySelector('#choice-left'),
  choiceRight: document.querySelector('#choice-right'),
  skipPair: document.querySelector('#skip-pair'),
  comparisonCount: document.querySelector('#comparison-count'),
  prioritizeFewerToggle: document.querySelector('#prioritize-fewer-toggle'),
  firstNameCount: document.querySelector('#first-name-count'),
  middleNameCount: document.querySelector('#middle-name-count'),
  firstNameList: document.querySelector('#first-name-list'),
  middleNameList: document.querySelector('#middle-name-list'),
  personalRankingUser: document.querySelector('#personal-ranking-user'),
  personalRankingSummary: document.querySelector('#personal-ranking-summary'),
  personalRankingList: document.querySelector('#personal-ranking-list'),
  confirmOverlay: document.querySelector('#user-confirm-overlay'),
  confirmUserName: document.querySelector('#confirm-user-name'),
  confirmUserYes: document.querySelector('#confirm-user-yes'),
  confirmUserNo: document.querySelector('#confirm-user-no'),
};

const state = {
  activeUser: getUserSlugFromPath(),
  users: [],
  firstNames: [],
  middleNames: [],
  combinations: [],
  rankings: [],
  lastName: '',
  prioritizeFewerComparisons: getSavedPrioritizeFewerPreference(),
};

let currentPair = null;

bindEvents();
loadState();

function bindEvents() {
  elements.firstNameForm.addEventListener('submit', handleFirstNameAdd);
  elements.middleNameForm.addEventListener('submit', handleMiddleNameAdd);
  elements.choiceLeft.addEventListener('click', () => submitComparison(currentPair ? currentPair.left : null));
  elements.choiceRight.addEventListener('click', () => submitComparison(currentPair ? currentPair.right : null));
  elements.skipPair.addEventListener('click', () => {
    currentPair = null;
    renderMatchup();
  });
  elements.prioritizeFewerToggle.addEventListener('change', handlePrioritizeFewerToggle);
  elements.confirmUserYes.addEventListener('click', confirmActiveUser);
  elements.confirmUserNo.addEventListener('click', startOver);
}

async function loadState() {
  setLoading(true);

  try {
    const payload = await apiFetchJson(`/api/finale/state/${encodeURIComponent(state.activeUser)}`);
    applyState(payload);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

async function handleFirstNameAdd(event) {
  event.preventDefault();
  const name = cleanName(elements.firstNameInput.value);

  if (!name) {
    return;
  }

  await addNames('/api/finale/first-names', [name]);
  elements.firstNameInput.value = '';
}

async function handleMiddleNameAdd(event) {
  event.preventDefault();
  const name = cleanName(elements.middleNameInput.value);

  if (!name) {
    return;
  }

  await addNames('/api/finale/middle-names', [name]);
  elements.middleNameInput.value = '';
}

async function addNames(url, names) {
  try {
    const payload = await apiFetchJson(url, {
      method: 'POST',
      body: JSON.stringify({ names, userSlug: state.activeUser }),
    });
    applyState(payload.state);
  } catch (error) {
    showError(error.message);
  }
}

async function deleteFirstName(nameId, name) {
  const confirmed = window.confirm(`Delete ${name} from the finale first-name pool? This removes every full combination that uses it.`);

  if (!confirmed) {
    return;
  }

  try {
    const payload = await apiFetchJson(`/api/finale/first-names/${nameId}?userSlug=${encodeURIComponent(state.activeUser)}`, {
      method: 'DELETE',
    });
    applyState(payload.state);
  } catch (error) {
    showError(error.message);
  }
}

async function deleteMiddleName(nameId, name) {
  const confirmed = window.confirm(`Delete ${name} from the finale middle-name pool? This removes every full combination that uses it.`);

  if (!confirmed) {
    return;
  }

  try {
    const payload = await apiFetchJson(`/api/finale/middle-names/${nameId}?userSlug=${encodeURIComponent(state.activeUser)}`, {
      method: 'DELETE',
    });
    applyState(payload.state);
  } catch (error) {
    showError(error.message);
  }
}

async function submitComparison(winnerCombo) {
  if (!currentPair || !winnerCombo) {
    return;
  }

  const loserCombo = winnerCombo === currentPair.left ? currentPair.right : currentPair.left;

  try {
    const payload = await apiFetchJson('/api/finale/comparisons', {
      method: 'POST',
      body: JSON.stringify({
        userSlug: state.activeUser,
        winnerFirstId: winnerCombo.firstNameId,
        winnerMiddleId: winnerCombo.middleNameId,
        loserFirstId: loserCombo.firstNameId,
        loserMiddleId: loserCombo.middleNameId,
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
    throw new Error('Oops! Please refresh and try again.');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'The request failed.');
  }

  return payload;
}

function applyState(payload) {
  state.activeUser = payload.activeUser;
  window.localStorage.setItem(LAST_ACTIVE_USER_KEY, state.activeUser);
  state.users = payload.users;
  state.firstNames = payload.firstNames;
  state.middleNames = payload.middleNames;
  state.combinations = payload.combinations;
  state.rankings = payload.rankings;
  state.lastName = payload.lastName || '';
  currentPair = null;
  render();
}

function render() {
  renderHeader();
  renderNamePools();
  renderMatchup();
  renderPersonalRanking();
  renderUserConfirmation();
}

function renderHeader() {
  const label = `/${state.activeUser}`;
  elements.currentUserHeading.textContent = label;
  elements.currentUserPill.textContent = 'Full-name finale';
  elements.activeUserInline.textContent = label;
  elements.personalRankingUser.textContent = label;
  elements.prioritizeFewerToggle.checked = state.prioritizeFewerComparisons;
}

function renderNamePools() {
  elements.firstNameList.innerHTML = '';
  elements.middleNameList.innerHTML = '';
  elements.firstNameCount.textContent = `${state.firstNames.length} ${state.firstNames.length === 1 ? 'name' : 'names'}`;
  elements.middleNameCount.textContent = `${state.middleNames.length} ${state.middleNames.length === 1 ? 'name' : 'names'}`;

  for (const entry of state.firstNames) {
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
      deleteFirstName(entry.id, entry.name);
    });

    item.append(label, deleteButton);
    elements.firstNameList.append(item);
  }

  for (const entry of state.middleNames) {
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
      deleteMiddleName(entry.id, entry.name);
    });

    item.append(label, deleteButton);
    elements.middleNameList.append(item);
  }
}

function renderMatchup() {
  const enoughCombinations = state.combinations.length >= 2;
  const activeRanking = getActiveRanking();
  elements.matchup.classList.toggle('hidden', !enoughCombinations);
  elements.matchupState.classList.toggle('hidden', enoughCombinations);

  if (!enoughCombinations) {
    elements.matchupState.innerHTML = '<p>Add enough first and middle names to create at least two full combinations.</p>';
    elements.comparisonCount.textContent = '0 comparisons recorded';
    return;
  }

  if (!currentPair || !hasPairInPool(currentPair)) {
    currentPair = chooseRandomPair();
  }

  elements.choiceLeft.innerHTML = renderChoiceCardContent(currentPair.left);
  elements.choiceRight.innerHTML = renderChoiceCardContent(currentPair.right);

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
    emptyScore.textContent = 'Compare combinations to build your order.';
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
    emptyName.textContent = 'No combinations yet';
    emptyScore.textContent = 'Add first and middle names to begin.';
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
    name.textContent = entry.fullName;
    score.textContent = `${Math.round(entry.rating)} rating`;
    item.append(name, score);
    elements.personalRankingList.append(item);
  }
}

function renderUserConfirmation() {
  const label = `/${state.activeUser}`;
  elements.confirmUserName.textContent = label;
  elements.confirmOverlay.classList.toggle('hidden', isActiveUserConfirmed());
}

function isActiveUserConfirmed() {
  return window.localStorage.getItem(getUserConfirmKey(state.activeUser)) === 'true';
}

function confirmActiveUser() {
  window.localStorage.setItem(getUserConfirmKey(state.activeUser), 'true');
  renderUserConfirmation();
}

function startOver() {
  window.location.href = '/finale';
}

function getUserConfirmKey(slug) {
  return `${USER_CONFIRM_PREFIX}${slug}`;
}

function getActiveRanking() {
  return state.rankings.find((ranking) => ranking.slug === state.activeUser);
}

function chooseRandomPair() {
  const pool = [...state.combinations];
  const left = state.prioritizeFewerComparisons
    ? chooseWeightedCombination(pool)
    : pool[Math.floor(Math.random() * pool.length)];

  let right = left;
  while (pool.length > 1 && right.firstNameId === left.firstNameId && right.middleNameId === left.middleNameId) {
    right = pool[Math.floor(Math.random() * pool.length)];
  }

  return { left, right };
}

function chooseWeightedCombination(pool) {
  const weightedPool = pool.map((entry) => ({
    entry,
    weight: 1 / (1 + getCombinationComparisonCount(entry)) ** 2,
  }));
  const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);

  if (!totalWeight) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  let threshold = Math.random() * totalWeight;

  for (const item of weightedPool) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.entry;
    }
  }

  return weightedPool[weightedPool.length - 1].entry;
}

function getCombinationComparisonCount(entry) {
  const activeRanking = getActiveRanking();
  if (!activeRanking) {
    return 0;
  }

  return activeRanking.names.find((item) => (
    item.firstNameId === entry.firstNameId && item.middleNameId === entry.middleNameId
  ))?.comparisonCount || 0;
}

function hasPairInPool(pair) {
  return hasCombination(pair.left) && hasCombination(pair.right) && !isSameCombination(pair.left, pair.right);
}

function hasCombination(target) {
  return state.combinations.some((entry) => (
    entry.firstNameId === target.firstNameId && entry.middleNameId === target.middleNameId
  ));
}

function isSameCombination(left, right) {
  return left.firstNameId === right.firstNameId && left.middleNameId === right.middleNameId;
}

function renderChoiceCardContent(entry) {
  return `
    <span class="choice-name">${escapeHtml(entry.firstName)}</span>
    <span class="choice-name finale-middle-name">${escapeHtml(entry.middleName)}</span>
    <span class="choice-blurb finale-last-name">${escapeHtml(state.lastName)}</span>
  `;
}

function handlePrioritizeFewerToggle() {
  state.prioritizeFewerComparisons = elements.prioritizeFewerToggle.checked;
  window.localStorage.setItem(PRIORITIZE_FEWER_KEY, state.prioritizeFewerComparisons ? 'true' : 'false');
  currentPair = null;
  renderMatchup();
}

function getUserSlugFromPath() {
  const slug = normalizeSlug(window.location.pathname.replace(/^\/finale\/+/, ''));

  if (!slug) {
    window.location.href = '/finale';
  }

  return slug || 'guest';
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

function getSavedPrioritizeFewerPreference() {
  const saved = window.localStorage.getItem(PRIORITIZE_FEWER_KEY);
  return saved === null ? true : saved === 'true';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setLoading(isLoading) {
  elements.currentUserPill.textContent = isLoading ? 'Loading' : 'Full-name finale';
}

function showError(message) {
  elements.matchup.classList.add('hidden');
  elements.matchupState.classList.remove('hidden');
  elements.matchupState.innerHTML = `<p>${message}</p>`;
}
