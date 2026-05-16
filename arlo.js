const elements = {
  form: document.querySelector('#arlo-form'),
  activityType: document.querySelector('#activity-type'),
  amountValue: document.querySelector('#amount-value'),
  amountUnit: document.querySelector('#amount-unit'),
  poopColorField: document.querySelector('#poop-color-field'),
  poopColor: document.querySelector('#poop-color'),
  poopColorWarning: document.querySelector('#poop-color-warning'),
  vitaminDField: document.querySelector('#vitamin-d-field'),
  vitaminD: document.querySelector('#vitamin-d'),
  breastSideField: document.querySelector('#breast-side-field'),
  breastSide: document.querySelector('#breast-side'),
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
        vitaminD: elements.vitaminD.checked,
        breastSide: elements.breastSide.value,
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

    grid.append(renderFeedingSummaryCard(summary));
    grid.append(renderDiaperSummaryCard(summary));

    section.append(grid);
    elements.summaryList.append(section);
  }
}

function getSummaryTotal(summary) {
  return Object.values(summary.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function renderFeedingSummaryCard(summary) {
  const activityTypes = ['breastfeeding', 'stored-breast-milk', 'colostrum', 'formula'];
  const card = document.createElement('div');
  card.className = 'summary-card';

  const totalCount = activityTypes.reduce((sum, activityType) => sum + getCount(summary, activityType), 0);
  const totalAmount = getCombinedFeedAmount(summary, ['stored-breast-milk', 'colostrum', 'formula']);
  const latest = getLatestAcrossActivities(summary, activityTypes);
  const parts = [`${totalCount} feeding${totalCount === 1 ? '' : 's'}`];

  if (totalAmount) {
    parts.push(totalAmount);
  }

  if (latest) {
    const elapsed = formatElapsedSince(summary.date, latest);
    if (elapsed) {
      parts.push(`${elapsed} ago`);
    }
  }

  const text = document.createElement('div');
  text.className = 'summary-card-text';
  text.textContent = parts.join(' • ');
  card.append(text);

  const events = buildTimelineEvents(summary, [
    { activityType: 'breastfeeding', colorClass: 'timeline-dot-breastfeeding' },
    { activityType: 'stored-breast-milk', colorClass: 'timeline-dot-stored-milk' },
    { activityType: 'colostrum', colorClass: 'timeline-dot-colostrum' },
    { activityType: 'formula', colorClass: 'timeline-dot-formula' },
  ]);

  if (events.length) {
    card.append(renderSummaryTimeline(events));
  }

  return card;
}

function renderDiaperSummaryCard(summary) {
  const activityTypes = ['poop-diaper', 'pee-diaper', 'both-diaper'];
  const card = document.createElement('div');
  card.className = 'summary-card';

  const totalCount = activityTypes.reduce((sum, activityType) => sum + getCount(summary, activityType), 0);
  const latest = getLatestAcrossActivities(summary, activityTypes);
  const parts = [`${totalCount} diaper${totalCount === 1 ? '' : 's'}`];

  if (latest) {
    const elapsed = formatElapsedSince(summary.date, latest);
    if (elapsed) {
      parts.push(`${elapsed} ago`);
    }
  }

  const text = document.createElement('div');
  text.className = 'summary-card-text';
  text.textContent = parts.join(' • ');
  card.append(text);

  const events = buildTimelineEvents(summary, [
    { activityType: 'poop-diaper', colorClass: 'timeline-dot-poop' },
    { activityType: 'pee-diaper', colorClass: 'timeline-dot-pee' },
    { activityType: 'both-diaper', colorClass: 'timeline-dot-poop', variantClass: 'timeline-dot-both-poop' },
    { activityType: 'both-diaper', colorClass: 'timeline-dot-pee', variantClass: 'timeline-dot-both-pee' },
  ]);

  if (events.length) {
    card.append(renderSummaryTimeline(events));
  }

  return card;
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
    const parts = [label];
    if (entry.breastSide) {
      parts.push(formatBreastSideLabel(entry.breastSide));
    }
    if (entry.poopColor) {
      parts.push(entry.poopColor);
    }
    if (entry.vitaminD) {
      parts.push('vitamin D');
    }
    return parts.join(' • ');
  }

  const parts = [label, formatAmount(entry.amountValue, entry.amountUnit || 'oz')];
  if (entry.breastSide) {
    parts.push(formatBreastSideLabel(entry.breastSide));
  }
  if (entry.poopColor) {
    parts.push(entry.poopColor);
  }
  if (entry.vitaminD) {
    parts.push('vitamin D');
  }
  return parts.join(' • ');
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

function formatBreastSideLabel(value) {
  const labels = {
    left: 'left',
    right: 'right',
    both: 'both',
  };

  return labels[value] || value;
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

function getCombinedFeedAmount(summary, activityTypes) {
  const rows = (summary?.feedAmounts || []).filter((entry) => activityTypes.includes(entry.activityType));
  if (!rows.length) {
    return '';
  }

  const totalsByUnit = new Map();
  for (const row of rows) {
    const key = row.amountUnit || '';
    totalsByUnit.set(key, (totalsByUnit.get(key) || 0) + Number(row.totalAmount || 0));
  }

  return [...totalsByUnit.entries()]
    .map(([unit, total]) => formatAmount(total, unit))
    .join(' + ');
}

function getEventTimes(summary, activityType) {
  return summary?.eventTimesByActivity?.[activityType] || [];
}

function getLatestAcrossActivities(summary, activityTypes) {
  const times = activityTypes
    .map((activityType) => getLatestTime(summary, activityType))
    .filter(Boolean)
    .sort();
  return times[times.length - 1] || '';
}

function buildTimelineEvents(summary, configs) {
  const events = [];
  for (const config of configs) {
    for (const event of getEventTimes(summary, config.activityType)) {
      events.push({
        eventTime: event.eventTime,
        vitaminD: Boolean(event.vitaminD),
        breastSide: event.breastSide || '',
        colorClass: config.colorClass,
        variantClass: config.variantClass || '',
      });
    }
  }

  return events.sort((left, right) => left.eventTime.localeCompare(right.eventTime));
}

function renderSummaryTimeline(events) {
  const track = document.createElement('div');
  track.className = 'summary-timeline';

  for (const event of events) {
    const dot = document.createElement('span');
    dot.className = `summary-timeline-dot ${event.colorClass}${event.variantClass ? ` ${event.variantClass}` : ''}`;
    dot.style.left = `${getTimelinePercent(event.eventTime)}%`;
    if (event.vitaminD) {
      dot.classList.add('summary-timeline-vitamin');
      dot.textContent = 'V';
    } else if (event.breastSide) {
      dot.classList.add('summary-timeline-letter');
      dot.textContent = getBreastSideMarker(event.breastSide);
    }
    dot.title = event.vitaminD
      ? `${formatDisplayTime(event.eventTime)} • vitamin D`
      : event.breastSide
        ? `${formatDisplayTime(event.eventTime)} • ${formatBreastSideLabel(event.breastSide)}`
        : formatDisplayTime(event.eventTime);
    track.append(dot);
  }

  return track;
}

function getTimelinePercent(eventTime) {
  const match = String(eventTime || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const totalMinutes = hours * 60 + minutes;
  return (totalMinutes / 1440) * 100;
}

function formatElapsedSince(eventDate, eventTime) {
  const match = String(eventTime || '').match(/^(\d{2}):(\d{2})$/);
  if (!match || !eventDate) {
    return '';
  }

  const eventAt = new Date(`${eventDate}T${match[1]}:${match[2]}:00`);
  const elapsedMs = Date.now() - eventAt.getTime();

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return '';
  }

  const totalMinutes = Math.floor(elapsedMs / 60000);
  if (totalMinutes >= 12 * 60) {
    return '';
  }

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
  const supportsVitaminD = new Set(['breastfeeding', 'stored-breast-milk', 'colostrum', 'formula']).has(elements.activityType.value);
  const supportsBreastSide = elements.activityType.value === 'breastfeeding';
  elements.amountValue.disabled = isDiaper;
  elements.amountUnit.disabled = isDiaper;
  elements.poopColorField.classList.toggle('hidden', !supportsPoopColor);
  elements.poopColor.disabled = !supportsPoopColor;
  elements.vitaminDField.classList.toggle('hidden', !supportsVitaminD);
  elements.vitaminD.disabled = !supportsVitaminD;
  elements.breastSideField.classList.toggle('hidden', !supportsBreastSide);
  elements.breastSide.disabled = !supportsBreastSide;
  elements.amountHelp.textContent = isDiaper
    ? 'Amount is only for feeding events.'
    : 'Use amount for formula, colostrum, or stored breast milk. For direct breastfeeding, leave it blank if you do not know.';

  if (isDiaper) {
    elements.amountValue.value = '';
  }

  if (!supportsPoopColor) {
    elements.poopColor.value = 'Mustard Yellow';
  }

  if (!supportsVitaminD) {
    elements.vitaminD.checked = false;
  }

  if (!supportsBreastSide) {
    elements.breastSide.value = '';
  }

  syncPoopColorWarning();
}

function resetAfterSubmit() {
  applyDefaultDateTimeForActivity();
  elements.amountValue.value = '';
  elements.amountUnit.value = 'ml';
  elements.poopColor.value = 'Mustard Yellow';
  elements.vitaminD.checked = false;
  elements.breastSide.value = '';
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

function getBreastSideMarker(value) {
  const markers = {
    left: 'L',
    right: 'R',
    both: 'B',
  };

  return markers[value] || '';
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
