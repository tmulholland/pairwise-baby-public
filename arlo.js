const elements = {
  form: document.querySelector('#arlo-form'),
  activityType: document.querySelector('#activity-type'),
  amountValue: document.querySelector('#amount-value'),
  amountUnit: document.querySelector('#amount-unit'),
  poopColorField: document.querySelector('#poop-color-field'),
  poopColor: document.querySelector('#poop-color'),
  poopColorWarning: document.querySelector('#poop-color-warning'),
  shartField: document.querySelector('#shart-field'),
  shart: document.querySelector('#shart'),
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
  chartToggle: document.querySelector('#arlo-chart-toggle'),
  chartPanel: document.querySelector('#arlo-chart-panel'),
  chartMetricButtons: document.querySelector('#arlo-chart-metric-buttons'),
  chartSeriesButtons: document.querySelector('#arlo-chart-series-buttons'),
  chartFeedModeButtons: document.querySelector('#arlo-chart-feed-mode-buttons'),
  chartInferredButtons: document.querySelector('#arlo-chart-inferred-buttons'),
  chartUnitButtons: document.querySelector('#arlo-chart-unit-buttons'),
  chartCaption: document.querySelector('#arlo-chart-caption'),
  chartSvg: document.querySelector('#arlo-chart-svg'),
  eventList: document.querySelector('#arlo-event-list'),
};

const POLL_INTERVAL_MS = 20000;
const ML_PER_OUNCE = 29.5735;
const FEEDING_ACTIVITY_TYPES = ['breastfeeding', 'stored-breast-milk', 'colostrum', 'formula', 'gripe-water'];
const FEEDING_ACTIVITY_OPTIONS = [
  { key: 'total', label: 'Total', color: '#83361f' },
  { key: 'breastfeeding', label: 'Breastfeeding', color: '#f3a9bf' },
  { key: 'stored-breast-milk', label: 'Stored milk', color: '#6b7280' },
  { key: 'colostrum', label: 'Colostrum', color: '#e5c44e' },
  { key: 'formula', label: 'Formula', color: '#97cf45' },
  { key: 'gripe-water', label: 'Gripe water', color: '#3b82f6' },
];
const CHART_METRIC_OPTIONS = [
  { key: 'feeds', label: 'Feeds/day' },
  { key: 'volume', label: 'mL/day' },
  { key: 'poops', label: 'Poops/day' },
  { key: 'pees', label: 'Pees/day' },
];
const CHART_INFERENCE_OPTIONS = [
  { key: 'known', label: 'Known only' },
  { key: 'inferred', label: 'Inferred' },
];
const CHART_UNIT_OPTIONS = [
  { key: 'ml', label: 'mL' },
  { key: 'oz', label: 'oz' },
];
const CHART_FEED_MODE_OPTIONS = [
  { key: 'raw', label: 'Raw' },
  { key: 'adjusted', label: 'Adjusted' },
];
const ADJUSTED_FEED_ACTIVITY_TYPES = ['breastfeeding', 'stored-breast-milk', 'colostrum', 'formula'];
const ADJUSTED_FEED_WINDOW_MINUTES = 45;

const state = {
  recentEvents: [],
  todaySummary: null,
  summaries: [],
  trendSummaries: [],
  chart: {
    open: false,
    metric: 'feeds',
    series: 'total',
    inference: 'known',
    unit: 'ml',
    feedMode: 'raw',
  },
};

let pollTimer = null;

initializeDefaults();
bindEvents();
loadState();

function initializeDefaults() {
  applyDefaultDateTimeForActivity();
  syncAmountState();
  renderChartControls();
  syncChartVisibility();
}

function bindEvents() {
  elements.form.addEventListener('submit', handleSubmit);
  elements.activityType.addEventListener('change', handleActivityChange);
  elements.poopColor.addEventListener('change', syncPoopColorWarning);
  elements.chartToggle.addEventListener('click', toggleChartPanel);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

async function loadState() {
  clearPollTimer();
  setStatus('Loading');
  showError('');

  try {
    const payload = await apiFetchJson('/api/arlo');
    applyState(payload);
    setStatus('Live');
  } catch (error) {
    setStatus('Error');
    showError(error.message);
  } finally {
    scheduleNextPoll();
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
        shart: elements.shart.checked,
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
  } finally {
    scheduleNextPoll();
  }
}

function applyState(payload) {
  state.recentEvents = payload.recentEvents || [];
  state.todaySummary = payload.todaySummary || null;
  state.summaries = payload.summaries || [];
  state.trendSummaries = payload.trendSummaries || payload.summaries || [];
  renderSummaries();
  renderChart();
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
  const activityTypes = FEEDING_ACTIVITY_TYPES;
  const card = document.createElement('div');
  card.className = 'summary-card';

  const totalCount = activityTypes.reduce((sum, activityType) => sum + getCount(summary, activityType), 0);
  const totalAmount = getCombinedFeedAmount(summary, ['stored-breast-milk', 'colostrum', 'formula', 'gripe-water']);
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
    { activityType: 'gripe-water', colorClass: 'timeline-dot-gripe-water' },
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
  } finally {
    scheduleNextPoll();
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
    if (entry.shart) {
      parts.push('shart');
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
  if (entry.shart) {
    parts.push('shart');
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
    'gripe-water': 'Gripe water',
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
  const stats = summary?.feedStats?.[activityType];
  if (!stats || Number(stats.totalAmountMl || 0) <= 0) {
    return '';
  }

  return formatVolumeAmount(stats.totalAmountMl);
}

function getCombinedFeedAmount(summary, activityTypes) {
  const totalMl = activityTypes.reduce((sum, activityType) => {
    return sum + Number(summary?.feedStats?.[activityType]?.totalAmountMl || 0);
  }, 0);
  if (totalMl <= 0) {
    return '';
  }

  return formatVolumeAmount(totalMl);
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
        shart: Boolean(event.shart),
        colorClass: event.shart && config.colorClass === 'timeline-dot-poop'
          ? 'timeline-dot-poop-shart'
          : config.colorClass,
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
  const supportsShart = supportsPoopColor;
  const supportsVitaminD = new Set(['breastfeeding', 'stored-breast-milk', 'colostrum', 'formula']).has(elements.activityType.value);
  const supportsBreastSide = elements.activityType.value === 'breastfeeding';
  elements.amountValue.disabled = isDiaper;
  elements.amountUnit.disabled = isDiaper;
  elements.poopColorField.classList.toggle('hidden', !supportsPoopColor);
  elements.poopColor.disabled = !supportsPoopColor;
  elements.shartField.classList.toggle('hidden', !supportsShart);
  elements.shart.disabled = !supportsShart;
  elements.vitaminDField.classList.toggle('hidden', !supportsVitaminD);
  elements.vitaminD.disabled = !supportsVitaminD;
  elements.breastSideField.classList.toggle('hidden', !supportsBreastSide);
  elements.breastSide.disabled = !supportsBreastSide;
  elements.amountHelp.textContent = isDiaper
    ? 'Amount is only for feeding events.'
    : 'Use amount for formula, colostrum, stored breast milk, or gripe water. For direct breastfeeding, leave it blank if you do not know.';

  if (isDiaper) {
    elements.amountValue.value = '';
  }

  if (!supportsPoopColor) {
    elements.poopColor.value = 'Mustard Yellow';
  }

  if (!supportsVitaminD) {
    elements.vitaminD.checked = false;
  }

  if (!supportsShart) {
    elements.shart.checked = false;
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
  elements.shart.checked = false;
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

function formatAmountMl(value) {
  return formatAmount(roundToOneDecimal(value), 'mL');
}

function formatAmountOzFromMl(value) {
  return formatAmount(roundToOneDecimal(Number(value || 0) / ML_PER_OUNCE), 'oz');
}

function formatVolumeAmount(valueMl) {
  return state.chart.unit === 'oz'
    ? formatAmountOzFromMl(valueMl)
    : formatAmountMl(valueMl);
}

function roundToOneDecimal(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function toggleChartPanel() {
  state.chart.open = !state.chart.open;
  syncChartVisibility();
  renderChart();
}

function syncChartVisibility() {
  elements.chartPanel.classList.toggle('hidden', !state.chart.open);
  elements.chartToggle.textContent = state.chart.open ? 'Hide charting' : 'Show charting';
}

function renderChartControls() {
  renderChartButtonGroup(elements.chartMetricButtons, CHART_METRIC_OPTIONS, state.chart.metric, (key) => {
    state.chart.metric = key;
    renderChartControls();
    renderChart();
  });
  renderChartButtonGroup(elements.chartSeriesButtons, FEEDING_ACTIVITY_OPTIONS, state.chart.series, (key) => {
    state.chart.series = key;
    renderChartControls();
    renderChart();
  }, state.chart.metric !== 'feeds' && state.chart.metric !== 'volume');
  renderChartButtonGroup(elements.chartFeedModeButtons, CHART_FEED_MODE_OPTIONS, state.chart.feedMode, (key) => {
    state.chart.feedMode = key;
    renderChartControls();
    renderChart();
  }, state.chart.metric !== 'feeds' || state.chart.series !== 'total');
  renderChartButtonGroup(elements.chartInferredButtons, CHART_INFERENCE_OPTIONS, state.chart.inference, (key) => {
    state.chart.inference = key;
    renderChartControls();
    renderChart();
  }, state.chart.metric !== 'volume');
  renderChartButtonGroup(elements.chartUnitButtons, CHART_UNIT_OPTIONS, state.chart.unit, (key) => {
    state.chart.unit = key;
    renderSummaries();
    renderChartControls();
    renderChart();
  });
}

function renderChartButtonGroup(container, options, activeKey, onClick, disabled = false) {
  container.innerHTML = '';
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ghost-button small${option.key === activeKey ? ' active-filter-button' : ''}`;
    button.textContent = option.label;
    button.disabled = disabled;
    button.addEventListener('click', () => {
      onClick(option.key);
    });
    container.append(button);
  }
}

function renderChart() {
  renderChartControls();

  if (!state.trendSummaries.length) {
    elements.chartCaption.textContent = 'No feeding trend yet.';
    elements.chartSvg.setAttribute('viewBox', '0 0 720 280');
    elements.chartSvg.innerHTML = '';
    return;
  }

  const points = buildChartPoints();
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const color = getChartSeriesColor(state.chart.series);
  const label = getChartDisplayLabel();
  const unit = getChartUnit();
  const total = roundToOneDecimal(points.reduce((sum, point) => sum + point.value, 0));

  const chartMarkup = buildChartSvg(points, maxValue, color, unit);
  elements.chartCaption.textContent = `${label} over the last ${points.length} day${points.length === 1 ? '' : 's'} • ${formatChartTotal(total, unit)}`;
  elements.chartSvg.setAttribute('viewBox', `0 0 ${chartMarkup.width} ${chartMarkup.height}`);
  elements.chartSvg.innerHTML = chartMarkup.markup;
}

function buildChartPoints() {
  return [...state.trendSummaries]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((summary) => ({
      date: summary.date,
      shortDate: formatChartDate(summary.date),
      value: getChartValue(summary),
    }));
}

function getChartValue(summary) {
  if (state.chart.metric === 'feeds') {
    if (state.chart.series === 'total') {
      if (state.chart.feedMode === 'adjusted') {
        return getAdjustedFeedCount(summary);
      }
      return FEEDING_ACTIVITY_TYPES.reduce((sum, activityType) => sum + getCount(summary, activityType), 0);
    }
    return getCount(summary, state.chart.series);
  }

  if (state.chart.metric === 'poops') {
    return getCount(summary, 'poop-diaper') + getCount(summary, 'both-diaper');
  }

  if (state.chart.metric === 'pees') {
    return getCount(summary, 'pee-diaper') + getCount(summary, 'both-diaper');
  }

  if (state.chart.series === 'total') {
    return getFeedVolumeMl(summary, null, state.chart.inference === 'inferred');
  }

  return getFeedVolumeMl(summary, state.chart.series, state.chart.inference === 'inferred');
}

function getFeedVolumeMl(summary, activityType, includeInference) {
  const statsMap = summary?.feedStats || {};
  const statsEntries = activityType
    ? [[activityType, statsMap[activityType] || null]]
    : Object.entries(statsMap);

  let totalMl = 0;
  let missingVolumeCount = 0;
  for (const [, stats] of statsEntries) {
    totalMl += Number(stats?.totalAmountMl || 0);
    missingVolumeCount += Number(stats?.missingVolumeCount || 0);
  }

  if (!includeInference) {
    return roundToOneDecimal(totalMl);
  }

  const knownTotalMl = Number(summary?.knownFeedVolumeMl || 0);
  const knownVolumeFeedCount = Number(summary?.knownVolumeFeedCount || 0);
  if (knownTotalMl <= 0 || knownVolumeFeedCount <= 0 || missingVolumeCount <= 0) {
    return roundToOneDecimal(totalMl);
  }

  const averageMl = knownTotalMl / knownVolumeFeedCount;
  return roundToOneDecimal(totalMl + averageMl * missingVolumeCount);
}

function getChartSeriesColor(seriesKey) {
  if (state.chart.metric === 'poops') {
    return '#8b5a2b';
  }

  if (state.chart.metric === 'pees') {
    return '#f1d04d';
  }

  const match = FEEDING_ACTIVITY_OPTIONS.find((option) => option.key === seriesKey);
  return match?.color || '#83361f';
}

function getChartDisplayLabel() {
  if (state.chart.metric === 'poops') {
    return 'Poops/day';
  }

  if (state.chart.metric === 'pees') {
    return 'Pees/day';
  }

  if (state.chart.metric === 'feeds' && state.chart.series === 'total' && state.chart.feedMode === 'adjusted') {
    return 'Adjusted feeds/day';
  }

  const metric = state.chart.metric === 'feeds'
    ? 'Feeds/day'
    : state.chart.unit === 'oz'
      ? 'oz/day'
      : 'mL/day';
  const series = FEEDING_ACTIVITY_OPTIONS.find((option) => option.key === state.chart.series)?.label || 'Total';
  if (state.chart.metric === 'volume' && state.chart.inference === 'inferred') {
    return `${series} ${metric.toLowerCase()} inferred`;
  }
  return `${series} ${metric.toLowerCase()}`;
}

function formatChartTotal(total, unit) {
  if (unit === 'feeds') {
    const label = state.chart.metric === 'poops'
      ? 'total poops'
      : state.chart.metric === 'pees'
        ? 'total pees'
        : 'total feeds';
    return `${Math.round(total)} ${label}`;
  }

  if (unit === 'oz') {
    return `${formatGallonsFromMl(total)} total`;
  }

  return `${formatLitersFromMl(total)} total`;
}

function getChartUnit() {
  if (state.chart.metric === 'volume') {
    return state.chart.unit;
  }

  return 'feeds';
}

function getAdjustedFeedCount(summary) {
  const allTimes = ADJUSTED_FEED_ACTIVITY_TYPES
    .flatMap((activityType) => getEventTimes(summary, activityType).map((event) => event.eventTime))
    .filter(Boolean)
    .sort();

  if (!allTimes.length) {
    return 0;
  }

  let count = 1;
  let previousMinutes = parseEventTimeToMinutes(allTimes[0]);
  for (let index = 1; index < allTimes.length; index += 1) {
    const currentMinutes = parseEventTimeToMinutes(allTimes[index]);
    if (currentMinutes === null || previousMinutes === null) {
      count += 1;
      previousMinutes = currentMinutes;
      continue;
    }

    if (currentMinutes - previousMinutes > ADJUSTED_FEED_WINDOW_MINUTES) {
      count += 1;
    }

    previousMinutes = currentMinutes;
  }

  return count;
}

function parseEventTimeToMinutes(eventTime) {
  const match = String(eventTime || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function buildChartSvg(points, maxValue, color, unit) {
  const width = 720;
  const height = points.length > 10 ? 312 : 280;
  const paddingLeft = 52;
  const paddingRight = 18;
  const paddingTop = 20;
  const paddingBottom = points.length > 10 ? 96 : 52;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const axisMax = getChartAxisMax(maxValue, unit);
  const yTicks = buildYAxisTicks(axisMax, unit);
  const xLabelStep = getXAxisLabelStep(points.length);

  const coords = points.map((point, index) => {
    const x = points.length === 1
      ? paddingLeft + chartWidth / 2
      : paddingLeft + (chartWidth * index) / (points.length - 1);
    const y = paddingTop + chartHeight - (point.value / axisMax) * chartHeight;
    return { ...point, x, y };
  });

  const pathData = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaData = coords.length
    ? `${pathData} L ${coords[coords.length - 1].x.toFixed(2)} ${(paddingTop + chartHeight).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(paddingTop + chartHeight).toFixed(2)} Z`
    : '';

  const gridLines = yTicks.map((tick) => {
    const y = paddingTop + chartHeight - (tick / axisMax) * chartHeight;
    return `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" class="arlo-chart-grid" />
      <text x="${paddingLeft - 10}" y="${y + 4}" class="arlo-chart-axis-label">${formatTickValue(tick, unit)}</text>`;
  }).join('');

  const xLabels = coords.map((point, index) => {
    if (index % xLabelStep !== 0 && index !== coords.length - 1) {
      return '';
    }

    const rotate = points.length > 10;
    if (rotate) {
      return `
        <text x="${point.x}" y="${height - 28}" text-anchor="end" transform="rotate(-45 ${point.x} ${height - 28})" class="arlo-chart-axis-label">${point.shortDate}</text>
      `;
    }

    return `
      <text x="${point.x}" y="${height - 16}" text-anchor="middle" class="arlo-chart-axis-label">${point.shortDate}</text>
    `;
  }).join('');

  const pointDots = coords.map((point) => `
    <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${color}">
      <title>${point.date}: ${formatTickValue(point.value, unit)}</title>
    </circle>
  `).join('');

  const emptyLineY = paddingTop + chartHeight;
  const lineMarkup = coords.length > 1
    ? `<path d="${areaData}" fill="${color}" fill-opacity="0.14"></path><path d="${pathData}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>`
    : `<line x1="${paddingLeft}" y1="${emptyLineY}" x2="${width - paddingRight}" y2="${emptyLineY}" class="arlo-chart-grid" />`;

  return {
    width,
    height,
    markup: `
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" class="arlo-chart-surface"></rect>
      ${gridLines}
      <line x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${width - paddingRight}" y2="${paddingTop + chartHeight}" class="arlo-chart-axis"></line>
      ${lineMarkup}
      ${pointDots}
      ${xLabels}
    `,
  };
}

function buildYAxisTicks(maxValue, unit) {
  const steps = 6;

  if (state.chart.metric !== 'volume') {
    const ticks = [];
    for (let index = 0; index <= steps; index += 1) {
      ticks.push((maxValue / steps) * index);
    }
    return ticks;
  }

  const step = getVolumeTickStep(maxValue, unit);
  const ticks = [];
  for (let tick = 0; tick <= maxValue + step / 2; tick += step) {
    ticks.push(tick);
  }
  return ticks;
}

function getChartAxisMax(maxValue, unit) {
  if (maxValue <= 0) {
    return 1;
  }

  if (state.chart.metric !== 'volume') {
    return maxValue;
  }

  return getRoundedVolumeAxisMax(maxValue, unit);
}

function getRoundedVolumeAxisMax(maxValue, unit) {
  const step = getVolumeTickStep(maxValue, unit);
  return Math.max(Math.ceil(maxValue / step) * step, step);
}

function getVolumeTickStep(maxValue, unit) {
  const targetStep = maxValue / 6;

  if (unit === 'oz') {
    const targetStepOz = targetStep / ML_PER_OUNCE;
    const niceStepOz = getNiceNumber(targetStepOz, [0.5, 1, 2, 2.5, 5, 10, 12.5, 25, 50]);
    return niceStepOz * ML_PER_OUNCE;
  }

  return getNiceNumber(targetStep, [5, 10, 20, 25, 50, 100, 125, 200, 250, 500]);
}

function getNiceNumber(target, candidates) {
  for (const candidate of candidates) {
    if (target <= candidate) {
      return candidate;
    }
  }

  const largest = candidates[candidates.length - 1] || 1;
  const base = target / largest;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(base || 1)));

  for (const candidate of candidates) {
    const scaled = candidate * magnitude;
    if (target <= scaled) {
      return scaled;
    }
  }

  return largest * magnitude * 10;
}

function getXAxisLabelStep(pointCount) {
  if (pointCount <= 10) {
    return 1;
  }

  if (pointCount <= 20) {
    return 2;
  }

  if (pointCount <= 40) {
    return 4;
  }

  if (pointCount <= 90) {
    return 7;
  }

  return Math.ceil(pointCount / 12);
}

function formatTickValue(value, unit) {
  if (unit === 'feeds') {
    return String(Math.round(value));
  }
  return unit === 'oz'
    ? `${roundToOneDecimal(Number(value || 0) / ML_PER_OUNCE)} oz`
    : `${roundToOneDecimal(value)} mL`;
}

function formatGallonsFromMl(valueMl) {
  const gallons = Number(valueMl || 0) / ML_PER_OUNCE / 128;
  return formatAmount(roundToOneDecimal(gallons), 'gal');
}

function formatLitersFromMl(valueMl) {
  const liters = Number(valueMl || 0) / 1000;
  return formatAmount(roundToOneDecimal(liters), 'L');
}

function formatChartDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }
  return `${match[2]}/${match[3]}`;
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

function handleVisibilityChange() {
  if (document.hidden) {
    clearPollTimer();
    return;
  }

  void loadState();
}

function scheduleNextPoll() {
  clearPollTimer();

  if (document.hidden) {
    return;
  }

  pollTimer = window.setTimeout(() => {
    void loadState();
  }, POLL_INTERVAL_MS);
}

function clearPollTimer() {
  if (pollTimer === null) {
    return;
  }

  window.clearTimeout(pollTimer);
  pollTimer = null;
}
