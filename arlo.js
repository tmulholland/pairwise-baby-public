const elements = {
  form: document.querySelector('#arlo-form'),
  activityType: document.querySelector('#activity-type'),
  amountValue: document.querySelector('#amount-value'),
  amountUnit: document.querySelector('#amount-unit'),
  poopColorField: document.querySelector('#poop-color-field'),
  poopColor: document.querySelector('#poop-color'),
  poopColorWarning: document.querySelector('#poop-color-warning'),
  amountHelp: document.querySelector('#amount-help'),
  eventDate: document.querySelector('#event-date'),
  eventTime: document.querySelector('#event-time'),
  status: document.querySelector('#arlo-status'),
  error: document.querySelector('#arlo-error'),
  summaryDate: document.querySelector('#arlo-summary-date'),
  summaryList: document.querySelector('#arlo-summary-list'),
  eventList: document.querySelector('#arlo-event-list'),
};

const state = {
  recentEvents: [],
  todaySummary: null,
  summaries: [],
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
  elements.poopColor.addEventListener('change', syncPoopColorWarning);
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
        poopColor: elements.poopColor.value,
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
  state.summaries = payload.summaries || [];
  renderSummaries();
  renderEvents();
}

function renderSummaries() {
  elements.summaryList.innerHTML = '';

  if (!state.summaries.length) {
    elements.summaryDate.textContent = 'Latest 7 days';
    elements.summaryList.innerHTML = '<p class="muted">No summary yet.</p>';
    return;
  }

  elements.summaryDate.textContent = `${state.summaries.length} day${state.summaries.length === 1 ? '' : 's'} loaded`;

  for (const summary of state.summaries) {
    const section = document.createElement('section');
    section.className = 'arlo-day-summary';

    const header = document.createElement('div');
    header.className = 'panel-header compact';

    const titleWrap = document.createElement('div');
    const label = document.createElement('p');
    const title = document.createElement('h3');
    label.className = 'section-label';
    title.className = 'arlo-day-heading';
    label.textContent = summary.date === formatDateLocal(new Date()) ? 'Today' : 'Day';
    title.textContent = summary.date;
    titleWrap.append(label, title);

    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = `${getSummaryTotal(summary)} event${getSummaryTotal(summary) === 1 ? '' : 's'}`;

    header.append(titleWrap, pill);
    section.append(header);

    const grid = document.createElement('div');
    grid.className = 'field-grid two-up';

    const summaryItems = [
      ['breastfeeding', 'breastfeeding'],
      ['stored-breast-milk', 'stored milk'],
      ['colostrum', 'colostrum'],
      ['formula', 'formula'],
      ['poop-diaper', 'poop diapers'],
      ['pee-diaper', 'pee diapers'],
      ['both-diaper', 'both diapers'],
    ];

    for (const [activityType, activityLabel] of summaryItems) {
      const card = document.createElement('div');
      card.className = 'summary-card';
      const latest = getLatestTime(summary, activityType);
      const totalAmount = getFeedAmount(summary, activityType);
      const parts = [`${getCount(summary, activityType)} ${activityLabel}`];

      if (latest) {
        parts.push(`${formatElapsedSince(summary.date, latest)} ago`);
      }

      if (totalAmount) {
        parts.push(totalAmount);
      }

      card.textContent = parts.join(' • ');
      grid.append(card);
    }

    section.append(grid);
    elements.summaryList.append(section);
  }
}

function getSummaryTotal(summary) {
  return Object.values(summary.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
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
    const actions = document.createElement('span');
    const deleteButton = document.createElement('button');
    title.className = 'ranking-name';
    meta.className = 'ranking-score';
    actions.className = 'arlo-log-actions';
    deleteButton.type = 'button';
    deleteButton.className = 'arlo-delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      deleteEvent(entry.id);
    });
    title.textContent = buildEventTitle(entry);
    meta.textContent = `${entry.eventDate} at ${formatDisplayTime(entry.eventTime)}`;
    actions.append(deleteButton);
    item.append(title, meta, actions);
    elements.eventList.append(item);
  }
}

async function deleteEvent(eventId) {
  const confirmed = window.confirm('Delete this Arlo event?');
  if (!confirmed) {
    return;
  }

  setStatus('Deleting');
  showError('');

  try {
    const payload = await apiFetchJson(`/api/arlo/events/${eventId}`, {
      method: 'DELETE',
    });
    applyState(payload);
    setStatus('Deleted');
  } catch (error) {
    setStatus('Error');
    showError(error.message);
  }
}

function buildEventTitle(entry) {
  const label = formatActivityLabel(entry.activityType);
  if (entry.amountValue === null || entry.amountValue === undefined || entry.amountValue === '') {
    return entry.poopColor ? `${label} • ${entry.poopColor}` : label;
  }

  const amountPart = `${label} • ${formatAmount(entry.amountValue, entry.amountUnit || 'oz')}`;
  return entry.poopColor ? `${amountPart} • ${entry.poopColor}` : amountPart;
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

function getCount(summary, activityType) {
  return Number(summary?.counts?.[activityType] || 0);
}

function getLatestTime(summary, activityType) {
  return summary?.latestByActivity?.[activityType] || '';
}

function getFeedAmount(summary, activityType) {
  const row = (summary?.feedAmounts || []).find((entry) => entry.activityType === activityType);
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
  const supportsPoopColor = new Set(['poop-diaper', 'both-diaper']).has(elements.activityType.value);
  elements.amountValue.disabled = isDiaper;
  elements.amountUnit.disabled = isDiaper;
  elements.poopColorField.classList.toggle('hidden', !supportsPoopColor);
  elements.poopColor.disabled = !supportsPoopColor;
  elements.amountHelp.textContent = isDiaper
    ? 'Amount is only for feeding events.'
    : 'Use amount for formula, colostrum, or stored breast milk. For direct breastfeeding, leave it blank if you do not know.';

  if (isDiaper) {
    elements.amountValue.value = '';
  }

  if (!supportsPoopColor) {
    elements.poopColor.value = 'Meconium';
  }

  syncPoopColorWarning();
}

function resetAfterSubmit() {
  applyDefaultDateTimeForActivity();
  elements.amountValue.value = '';
  elements.amountUnit.value = 'ml';
  elements.poopColor.value = 'Meconium';
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

function syncPoopColorWarning() {
  const warningColors = new Set(['Red', 'White', 'Gray', 'Clay', 'Black']);
  const showWarning = !elements.poopColor.disabled && warningColors.has(elements.poopColor.value);
  elements.poopColor.classList.toggle('warning-select', showWarning);
  elements.poopColorWarning.classList.toggle('hidden', !showWarning);
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
