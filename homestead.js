const storageKey = 'homestead-landmarks-v1';
const landmarkUrl = '/api/homestead/landmarks';
const featureUrl = '/api/homestead/features';
const map = document.querySelector('.map');
const viewport = document.querySelector('.map-viewport');
const zoomOut = document.querySelector('#zoom-out');
const zoomIn = document.querySelector('#zoom-in');
const zoomReset = document.querySelector('#zoom-reset');
const background = document.querySelector('#background');
const add = document.querySelector('#add');
const place = document.querySelector('#place');
const draft = document.querySelector('#draft');
const markers = document.querySelector('#markers');
const showLandmarks = document.querySelector('#show-landmarks');
const status = document.querySelector('#status');
const featureLayer = document.querySelector('#features');
const featureList = document.querySelector('#feature-list');
const draw = document.querySelector('#draw');
const featureName = document.querySelector('#feature-name');
const undo = document.querySelector('#undo');
const finish = document.querySelector('#finish');
const featureForm = document.querySelector('#feature-form');
const dialog = document.querySelector('#landmark-dialog');
const title = document.querySelector('#landmark-title');
const dialogStatus = document.querySelector('#landmark-status');
const details = document.querySelector('#landmark-details');
const gallery = document.querySelector('#gallery');
const form = document.querySelector('#landmark-form');
const existingPhotos = document.querySelector('#existing-photos');
const emojiSearch = document.querySelector('#emoji-search');
const iconSelect = form.elements.icon;
const edit = document.querySelector('#edit');
const close = document.querySelector('#close-dialog');
const deleteButton = document.querySelector('#delete-landmark');
const clamp = (value) => Math.max(0, Math.min(1, value));
const zoomLevels = [1, 1.5, 2, 3, 4];
const minZoom = zoomLevels[0];
const maxZoom = zoomLevels[zoomLevels.length - 1];
const featureLabels = { trail: 'Trail', creek: 'Creek', region: 'Region' };
const svgNamespace = 'http://www.w3.org/2000/svg';
let zoom = minZoom;
let drag;
const touchPointers = new Map();
let pinch;
let suppressClick = false;
let position;
let mode = '';
let points = [];
let landmarks = [];
let features = [];
let selectedLandmark;
let detailRequest = 0;
let emojiCatalog;
let savingLandmark = false;
let updatingFeatures = false;

function mapPosition({ x, y }) {
  return {
    x: clamp((viewport.scrollLeft + x) / map.offsetWidth),
    y: clamp((viewport.scrollTop + y) / map.offsetHeight)
  };
}

function viewportCenter() {
  return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
}

function visibleCenter() {
  return mapPosition(viewportCenter());
}

function zoomAt(scale, point, anchor) {
  zoom = Math.max(minZoom, Math.min(maxZoom, scale));
  viewport.classList.toggle('zoomed', zoom > minZoom);
  map.style.setProperty('--map-width', `${zoom * 100}%`);
  viewport.scrollLeft = point.x * map.offsetWidth - anchor.x;
  viewport.scrollTop = point.y * map.offsetHeight - anchor.y;
  zoomOut.disabled = zoomReset.disabled = zoom === minZoom;
  zoomIn.disabled = zoom === maxZoom;
}

function zoomTo(scale) {
  zoomAt(scale, visibleCenter(), viewportCenter());
}

zoomOut.addEventListener('click', () => {
  const smaller = zoomLevels.filter((level) => level < zoom);
  zoomTo(smaller[smaller.length - 1] ?? minZoom);
});
zoomIn.addEventListener('click', () => zoomTo(zoomLevels.find((level) => level > zoom) ?? maxZoom));
zoomReset.addEventListener('click', () => zoomTo(minZoom));

function startDrag(id, { x, y }, moved = false) {
  drag = {
    id, x, y, left: viewport.scrollLeft, top: viewport.scrollTop, moved
  };
}

function measurePinch() {
  const [first, second] = touchPointers.values();
  const bounds = viewport.getBoundingClientRect();
  return {
    distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
    center: {
      x: (first.x + second.x) / 2 - bounds.left,
      y: (first.y + second.y) / 2 - bounds.top
    }
  };
}

function startPinch() {
  const { distance, center } = measurePinch();
  pinch = { distance, zoom, point: mapPosition(center) };
  drag = undefined;
  suppressClick = true;
  viewport.classList.remove('dragging');
  for (const id of touchPointers.keys()) viewport.setPointerCapture(id);
}

viewport.addEventListener('pointerdown', (event) => {
  const { pointerId: id, clientX: x, clientY: y } = event;
  if (event.button !== 0) return;
  if (event.pointerType === 'touch') {
    touchPointers.set(id, { x, y });
    if (touchPointers.size >= 2) {
      startPinch();
      return;
    }
  } else if (!event.isPrimary || touchPointers.size) {
    return;
  }
  suppressClick = false;
  if (zoom > minZoom) startDrag(id, { x, y });
});
viewport.addEventListener('pointermove', (event) => {
  if (touchPointers.has(event.pointerId)) {
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch) {
      const { distance, center } = measurePinch();
      zoomAt(pinch.zoom * distance / pinch.distance, pinch.point, center);
      return;
    }
  }
  if (event.pointerId !== drag?.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    suppressClick = true;
    viewport.setPointerCapture(drag.id);
    viewport.classList.add('dragging');
  }
  viewport.scrollLeft = drag.left - dx;
  viewport.scrollTop = drag.top - dy;
});
function endDrag(event) {
  if (event.pointerId !== drag?.id) return;
  drag = undefined;
  viewport.classList.remove('dragging');
}
function endPointer(event) {
  if (touchPointers.delete(event.pointerId) && pinch) {
    if (touchPointers.size >= 2) {
      startPinch();
    } else {
      pinch = undefined;
      if (touchPointers.size && zoom > minZoom) {
        const [[id, point]] = touchPointers;
        startDrag(id, point, true);
        viewport.classList.add('dragging');
      }
    }
    return;
  }
  endDrag(event);
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('lostpointercapture', (event) => {
  if (event.target === viewport) endPointer(event);
});
viewport.addEventListener('pointerleave', (event) => {
  if (event.pointerType !== 'touch' && !drag?.moved) endDrag(event);
});
viewport.addEventListener('click', (event) => {
  if (suppressClick && (event.detail > 0 || event.pointerType === 'touch')) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

async function requestJson(url, method = 'GET', data) {
  const response = await fetch(url, data === undefined ? undefined : {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) throw new Error(result?.error || 'The request failed. Try again.');
  return result;
}

async function loadLandmarks() {
  let localLandmarks;
  try {
    localLandmarks = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {
    // Shared landmarks are available even when browser storage is unavailable.
  }
  try {
    landmarks = await requestJson(landmarkUrl);
    renderLandmarks();
    if (Array.isArray(localLandmarks) && localLandmarks.length) {
      try {
        landmarks = await requestJson(landmarkUrl, 'POST', localLandmarks);
        renderLandmarks();
        localStorage.removeItem(storageKey);
      } catch {
        status.textContent = 'Previously saved browser landmarks could not be migrated. Reload to retry.';
      }
    }
  } catch {
    status.textContent = 'Shared landmarks could not be loaded. Reload to retry.';
  } finally {
    add.disabled = false;
  }
}

async function loadFeatures() {
  try {
    features = await requestJson(featureUrl);
    renderFeatures();
  } catch {
    status.textContent = 'Shared map shapes could not be loaded. Reload to retry.';
  } finally {
    draw.disabled = false;
  }
}

document.querySelector('fieldset').addEventListener('change', (event) => {
  const layer = event.target.value;
  background.src = `/static/homestead-assets/${layer}`;
  background.alt = layer === 'aerial.jpg'
    ? 'Aerial view near Dewittville'
    : 'Topographic view near Dewittville with 20-foot contours';
});

function putAt(element, { x, y }) {
  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
}

function renderLandmarks() {
  markers.hidden = !showLandmarks.checked;
  markers.replaceChildren();
  for (const landmark of landmarks) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.textContent = landmark.icon;
    pin.title = landmark.name;
    pin.setAttribute('aria-label', landmark.name);
    putAt(pin, landmark);
    pin.addEventListener('click', () => void openLandmark(landmark));
    markers.append(pin);
  }
}

showLandmarks.addEventListener('change', () => {
  markers.hidden = !showLandmarks.checked;
});

function photoImage(photo, name, index) {
  const image = document.createElement('img');
  image.src = photo;
  image.alt = `Photo ${index + 1} of ${name}`;
  return image;
}

function showLandmark(landmark) {
  selectedLandmark = landmark;
  title.textContent = `${landmark.icon} ${landmark.name}`;
  form.hidden = true;
  details.hidden = false;
  edit.hidden = false;
  gallery.replaceChildren(...landmark.photos.map((photo, index) => photoImage(photo, landmark.name, index)));
  dialogStatus.textContent = landmark.photos.length ? '' : 'No photos yet.';
}

async function openLandmark(landmark) {
  const request = ++detailRequest;
  title.textContent = `${landmark.icon} ${landmark.name}`;
  form.hidden = details.hidden = true;
  dialogStatus.textContent = 'Loading landmark…';
  dialog.showModal();
  try {
    const detail = await requestJson(`${landmarkUrl}/${landmark.id}`);
    if (request === detailRequest && dialog.open) showLandmark(detail);
  } catch (error) {
    if (request === detailRequest && dialog.open) dialogStatus.textContent = error.message;
  }
}

function renderEmojiOptions(selected = iconSelect.value || '🪨') {
  const query = emojiSearch.value.trim().toLowerCase();
  const words = query.split(/\s+/);
  const options = [];
  const current = document.createElement('option');
  current.value = selected;
  const currentName = emojiCatalog?.groups.flatMap(({ entries }) => entries)
    .find(([emoji]) => emoji === selected)?.[1];
  current.textContent = currentName ? `${selected} ${currentName}` : selected;
  options.push(current);
  for (const { name, entries } of emojiCatalog?.groups ?? []) {
    const group = document.createElement('optgroup');
    group.label = name;
    for (const [icon, label] of entries) {
      if (icon === selected || (query && !icon.includes(query) &&
          !words.every((word) => label.toLowerCase().includes(word)))) continue;
      const option = document.createElement('option');
      option.value = icon;
      option.textContent = `${icon} ${label}`;
      group.append(option);
    }
    if (group.childElementCount) options.push(group);
  }
  iconSelect.replaceChildren(...options);
  iconSelect.value = selected;
}

async function openEditor(landmark) {
  selectedLandmark = landmark;
  title.textContent = landmark ? 'Edit landmark' : 'Add landmark';
  details.hidden = true;
  form.reset();
  form.hidden = false;
  deleteButton.hidden = !landmark;
  dialogStatus.textContent = '';
  form.elements.name.value = landmark?.name ?? '';
  existingPhotos.replaceChildren(...(landmark?.photos ?? []).map((photo, index) => {
    const label = document.createElement('label');
    const keep = document.createElement('input');
    keep.type = 'checkbox';
    keep.checked = true;
    keep.dataset.photoIndex = index;
    label.append(photoImage(photo, landmark.name, index), keep, ' Keep photo');
    return label;
  }));
  renderEmojiOptions(landmark?.icon ?? '🪨');
  if (!dialog.open) dialog.showModal();
  form.elements.name.focus();
  if (!emojiCatalog) {
    try {
      emojiCatalog = await requestJson('/static/homestead-assets/emoji.json');
      if (dialog.open && !form.hidden) renderEmojiOptions();
    } catch {
      if (dialog.open && !form.hidden) dialogStatus.textContent = 'Could not load the emoji picker. Reopen the editor to retry.';
    }
  }
}

emojiSearch.addEventListener('input', () => renderEmojiOptions());
edit.addEventListener('click', () => void openEditor(selectedLandmark));
close.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', (event) => { if (savingLandmark) event.preventDefault(); });

deleteButton.addEventListener('click', async () => {
  const landmark = selectedLandmark;
  if (!landmark || savingLandmark ||
      !window.confirm(`Delete “${landmark.name}” and its photos from the shared map?`)) return;
  const controls = [close, ...form.elements];
  savingLandmark = true;
  for (const control of controls) control.disabled = true;
  dialogStatus.textContent = 'Deleting landmark…';
  const { id, name, icon, x, y } = landmark;
  try {
    landmarks = await requestJson(`${landmarkUrl}/${id}`, 'DELETE', { name, icon, x, y });
    dialog.close();
    renderLandmarks();
    add.focus({ preventScroll: true });
    status.textContent = `Deleted ${name}.`;
  } catch (error) {
    dialogStatus.textContent = error.message;
  } finally {
    savingLandmark = false;
    for (const control of controls) control.disabled = false;
  }
});

async function preparePhoto(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose photos that are 25 MB or smaller.');
  let photo;
  try {
    photo = await createImageBitmap(file);
  } catch {
    throw new Error('This photo could not be opened. Try a JPEG or PNG.');
  }
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    for (const maxEdge of [1280, 960, 640]) {
      const scale = Math.min(1, maxEdge / Math.max(photo.width, photo.height));
      canvas.width = Math.max(1, Math.round(photo.width * scale));
      canvas.height = Math.max(1, Math.round(photo.height * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.8);
      if (data.length <= 700_000) return data;
    }
    throw new Error('This photo could not be compressed enough to save.');
  } finally {
    photo.close();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  if (!name || savingLandmark) {
    if (!name) dialogStatus.textContent = 'Enter a landmark name.';
    return;
  }
  const icon = iconSelect.value;
  const previous = selectedLandmark;
  const photos = [...existingPhotos.querySelectorAll('input:checked')]
    .map((input) => previous.photos[Number(input.dataset.photoIndex)]);
  const files = [...form.elements.photos.files];
  if (photos.length + files.length > 6) {
    dialogStatus.textContent = 'Choose up to six photos in total.';
    return;
  }
  const controls = [close, ...form.elements];
  savingLandmark = true;
  for (const control of controls) control.disabled = true;
  dialogStatus.textContent = 'Saving landmark…';
  try {
    for (const file of files) photos.push(await preparePhoto(file));
    if (previous) {
      const updated = await requestJson(`${landmarkUrl}/${previous.id}`, 'PUT', {
        name, icon, photos, previousName: previous.name, previousIcon: previous.icon, previousPhotos: previous.photos
      });
      landmarks = landmarks.map((landmark) => landmark.id === updated.id ? updated : landmark);
      showLandmark(updated);
    } else {
      landmarks = await requestJson(landmarkUrl, 'POST', [{ ...position, name, icon, photos }]);
      dialog.close();
    }
    renderLandmarks();
    status.textContent = `Saved ${name}.`;
  } catch (error) {
    dialogStatus.textContent = error.message;
  } finally {
    savingLandmark = false;
    for (const control of controls) control.disabled = false;
  }
});

function svgElement(tag, attributes) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function shape({ kind, points: vertices }, isDraft = false) {
  const isPolygon = kind === 'region' && vertices.length >= 3;
  return svgElement(isPolygon ? 'polygon' : 'polyline', {
    class: `feature ${kind}${isDraft ? ' draft' : ''}`,
    points: vertices.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ')
  });
}

async function deleteSavedFeature(feature, button) {
  const { id, kind, name, points } = feature;
  if (updatingFeatures || !window.confirm(`Delete the ${kind} “${name}” from the shared map?`)) return;
  updatingFeatures = true;
  button.disabled = true;
  try {
    features = await requestJson(`${featureUrl}/${id}`, 'DELETE', { kind, name, points });
    renderFeatures();
    draw.focus({ preventScroll: true });
    status.textContent = `Deleted ${name}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    updatingFeatures = false;
    button.disabled = false;
  }
}

function renderFeatures() {
  const layers = features.map((feature) => shape(feature));
  if (points.length) {
    layers.push(shape({ kind: mode, points }, true));
    for (const { x, y } of points) {
      layers.push(svgElement('circle', { class: 'feature-vertex', cx: x * 1000, cy: y * 1000, r: 3 }));
    }
  }
  featureLayer.replaceChildren(...layers);
  featureList.hidden = !features.length;
  featureList.replaceChildren(...features.map((feature) => {
    const { name, kind } = feature;
    const entry = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${featureLabels[kind]} · ${name}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'delete-feature';
    button.textContent = 'Delete';
    button.setAttribute('aria-label', `Delete ${kind} ${name}`);
    button.addEventListener('click', () => void deleteSavedFeature(feature, button));
    entry.append(label, button);
    return entry;
  }));
  undo.disabled = !points.length;
  finish.disabled = new Set(points.map(({ x, y }) => `${x},${y}`)).size < (mode === 'region' ? 3 : 2);
}

function startPlacement(kind) {
  mode = kind;
  points = [];
  position = visibleCenter();
  putAt(draft, position);
  draft.hidden = place.hidden = false;
  featureForm.reset();
  featureForm.hidden = false;
  featureName.hidden = featureForm.elements.name.disabled = undo.hidden = finish.hidden = mode === 'landmark';
  status.textContent = mode === 'landmark'
    ? 'Click or tap to place a landmark. Use the arrow keys and Enter to place it by keyboard.'
    : 'Add points and enter a name, then select Finish drawing to save. Use the arrow keys and Enter to add points by keyboard.';
  renderFeatures();
  place.focus({ preventScroll: true });
}

function stopPlacement() {
  mode = '';
  points = [];
  draft.hidden = place.hidden = featureForm.hidden = true;
  draw.value = '';
  status.textContent = '';
  renderFeatures();
}

add.addEventListener('click', () => {
  if (updatingFeatures) return;
  draw.value = '';
  startPlacement('landmark');
});
draw.addEventListener('change', () => {
  if (draw.value) startPlacement(draw.value);
  else stopPlacement();
});

place.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const control = mode === 'landmark' ? add : draw;
    stopPlacement();
    control.focus();
    return;
  }
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  const [dx, dy] = direction;
  position.x = clamp(position.x + dx * 0.01);
  position.y = clamp(position.y + dy * 0.01);
  putAt(draft, position);
  draft.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

place.addEventListener('click', (event) => {
  if (event.detail > 0) {
    const bounds = map.getBoundingClientRect();
    position = { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
  }
  putAt(draft, position);
  if (mode === 'landmark') {
    stopPlacement();
    add.focus({ preventScroll: true });
    void openEditor();
    return;
  }
  if (points.length >= 1000) {
    status.textContent = 'This shape has reached 1,000 points. Finish drawing to save it.';
    return;
  }
  points.push({ ...position });
  renderFeatures();
});

undo.addEventListener('click', () => { points.pop(); renderFeatures(); });
document.querySelector('#cancel-drawing').addEventListener('click', () => {
  const control = mode === 'landmark' ? add : draw;
  stopPlacement();
  control.focus();
});
featureForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (updatingFeatures || finish.disabled || finish.hidden) return;
  const name = featureForm.elements.name.value.trim();
  if (!name) {
    status.textContent = 'Enter a name for the shape.';
    featureForm.elements.name.focus();
    return;
  }
  const controls = [draw, add, place, ...featureForm.elements].filter((control) => !control.disabled);
  updatingFeatures = true;
  for (const control of controls) control.disabled = true;
  status.textContent = `Saving ${name}…`;
  try {
    features = await requestJson(featureUrl, 'POST', { kind: mode, name, points });
    stopPlacement();
    status.textContent = `Saved ${name}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    updatingFeatures = false;
    for (const control of controls) control.disabled = false;
    if (!mode) draw.focus();
  }
});

zoomTo(zoomLevels[1]);
viewport.scrollLeft /= 2;
viewport.scrollTop = 0;

void loadLandmarks();
void loadFeatures();
