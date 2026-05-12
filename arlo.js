const elements = {
  form: document.querySelector('#arlo-form'),
  activityType: document.querySelector('#activity-type'),
  amountValue: document.querySelector('#amount-value'),
  amountUnit: document.querySelector('#amount-unit'),
  amountHelp: document.querySelector('#amount-help'),
  eventDate: document.querySelector('#event-date'),
  eventTime: document.querySelector('#event-time'),
  status: document.querySelector('#arlo-status'),
  error: document.querySelector('#arlo-error'),
  summaryDate: document.querySelector('#arlo-summary-date'),
  summary: document.querySelector('#arlo-summary'),
  eventList: document.querySelector('#arlo-event-list'),
};

const state = {
  recentEvents: [],
  todaySummary: null,
};

initializeDefaults();
bindEvents();
loadState();

function initializeDefaults() {
  applyDefaultDateTimeForActivity();
  syncAmountState();
}

function bindEvents() {
  elements.form.addEventListener('submit', handleSubmit);
  elements.activityType.addEventListener('change', handleActivityChange);
}

async function loadState() {
  setStatus('Loading');
  showError('');

  try {
    const payload = await apiFetchJson('/api/arlo');
    applyState(payload);
    setStatus('Live');
  } catch (error) {
    setStatus('Error');
    showError(error.message);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  setStatus('Saving');
  showError('');

  try {
    const payload = await apiFetchJson('/api/arlo/events', {
      method: 'POST',
      body: JSON.stringify({
        activityType: elements.activityType.value,
        amountValue: elements.amountValue.value,
        amountUnit: elements.amountUnit.value,
        eventDate: elements.eventDate.value,
        eventTime: elements.eventTime.value,
      }),
    });
    applyState(payload);
    resetAfterSubmit();
    setStatus('Saved');
  } catch (error) {
    setStatus('Error');
    showError(error.message);
  }
}

function applyState(payload) {
  state.recentEvents = payload.recentEvents || [];
  state.todaySummary = payload.todaySummary || null;
  renderSummary();
  renderEvents();
}

function renderSummary() {
  elements.summary.innerHTML = '';

  if (!state.todaySummary) {
    elements.summaryDate.textContent = 'Today';
    elements.summary.innerHTML = '<p class="muted">No summary yet.</p>';
    return;
  }

  elements.summaryDate.textContent = state.todaySummary.date;
  const summaryItems = [
    ['breastfeeding', 'breastfeeding'],
    ['stored-breast-milk', 'stored milk'],
    ['colostrum', 'colostrum'],
    ['formula', 'formula'],
    ['poop-diaper', 'poop diapers'],
    ['pee-diaper', 'pee diapers'],
    ['both-diaper', 'both diapers'],
  ];

  for (const [activityType, label] of summaryItems) {
    const card = document.createElement('div');
    card.className = 'summary-card';
    const latest = getLatestTime(activityType);
    const totalAmount = getFeedAmount(activityType);
    const parts = [`${getCount(activityType)} ${label}`];

    if (latest) {
      parts.push(`${formatElapsedSince(state.todaySummary.date, latest)} ago`);
    }

    if (totalAmount) {
      parts.push(totalAmount);
    }

    card.textContent = parts.join(' • ');
    elements.summary.append(card);
  }
}

function renderEvents() {
  elements.eventList.innerHTML = '';

  if (!state.recentEvents.length) {
    const empty = document.createElement('li');
    const title = document.createElement('span');
    const meta = document.createElement('span');
    title.className = 'ranking-name';
    meta.className = 'ranking-score';
    title.textContent = 'No events yet';
    meta.textContent = 'Your next feeding or diaper log will show up here.';
    empty.append(title, meta);
    elements.eventList.append(empty);
    return;
  }

  for (const entry of state.recentEvents) {
    const item = document.createElement('li');
    const title = document.createElement('span');
    const meta = document.createElement('span');
    title.className = 'ranking-name';
    meta.className = 'ranking-score';
    title.textContent = buildEventTitle(entry);
    meta.textContent = `${entry.eventDate} at ${formatDisplayTime(entry.eventTime)}`;
    item.append(title, meta);
    elements.eventList.append(item);
  }
}

function buildEventTitle(entry) {
  const label = formatActivityLabel(entry.activityType);
  if (entry.amountValue === null || entry.amountValue === undefined || entry.amountValue === '') {
    return label;
  }

  return `${label} • ${formatAmount(entry.amountValue, entry.amountUnit || 'oz')}`;
}

function formatActivityLabel(activityType) {
  const labels = {
    breastfeeding: 'Breastfeeding',
    'stored-breast-milk': 'Stored breast milk',
    colostrum: 'Colostrum',
    formula: 'Formula',
    'poop-diaper': 'Poop diaper',
    'pee-diaper': 'Pee diaper',
    'both-diaper': 'Poop + pee diaper',
  };

  return labels[activityType] || activityType;
}

function formatAmount(value, unit) {
  const number = Number(value);
  const normalized = Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
  return `${normalized} ${unit}`;
}

function formatDisplayTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return String(value || '');
  }

  const hours24 = Number(match[1]);
  const minutes = match[2];
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${suffix}`;
}

function getCount(activityType) {
  return Number(state.todaySummary?.counts?.[activityType] || 0);
}

function getLatestTime(activityType) {
  return state.todaySummary?.latestByActivity?.[activityType] || '';
}

function getFeedAmount(activityType) {
  const row = (state.todaySummary?.feedAmounts || []).find((entry) => entry.activityType === activityType);
  if (!row) {
    return '';
  }

  return formatAmount(row.totalAmount, row.amountUnit);
}

function formatElapsedSince(eventDate, eventTime) {
  const match = String(eventTime || '').match(/^(\d{2}):(\d{2})$/);
  if (!match || !eventDate) {
    return 'latest recently';
  }

  const eventAt = new Date(`${eventDate}T${match[1]}:${match[2]}:00`);
  const elapsedMs = Date.now() - eventAt.getTime();

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 'latest recently';
  }

  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

function syncAmountState() {
  const diaperActivities = new Set(['poop-diaper', 'pee-diaper', 'both-diaper']);
  const isDiaper = diaperActivities.has(elements.activityType.value);
  elements.amountValue.disabled = isDiaper;
  elements.amountUnit.disabled = isDiaper;
  elements.amountHelp.textContent = isDiaper
    ? 'Amount is only for feeding events.'
    : 'Use amount for formula, colostrum, or stored breast milk. For direct breastfeeding, leave it blank if you do not know.';

  if (isDiaper) {
    elements.amountValue.value = '';
  }
}

function resetAfterSubmit() {
  applyDefaultDateTimeForActivity();
  elements.amountValue.value = '';
  elements.amountUnit.value = 'ml';
  syncAmountState();
}

function handleActivityChange() {
  applyDefaultDateTimeForActivity();
  syncAmountState();
}

function applyDefaultDateTimeForActivity() {
  const now = new Date();
  const isDiaper = new Set(['poop-diaper', 'pee-diaper', 'both-diaper']).has(elements.activityType.value);
  const defaultTime = isDiaper ? now : new Date(now.getTime() - 15 * 60 * 1000);
  elements.eventDate.value = formatDateLocal(now);
  elements.eventTime.value = formatTimeLocal(defaultTime);
}

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeLocal(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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

function setStatus(message) {
  elements.status.textContent = message;
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.classList.toggle('hidden', !message);
}
