const storageKey = 'homestead-landmarks-v1';
const landmarksUrl = '/api/homestead/landmarks';
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
const form = document.querySelector('#landmark-form');
const status = document.querySelector('#status');
let position;
let landmarks = [];
const zoomLevels = [1, 1.5, 2, 3, 4];
let zoomIndex = 0;

function zoomTo(index) {
  const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / map.offsetWidth;
  const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / map.offsetHeight;
  zoomIndex = index;
  map.style.setProperty('--map-width', `${zoomLevels[index] * 100}%`);
  viewport.scrollLeft = centerX * map.offsetWidth - viewport.clientWidth / 2;
  viewport.scrollTop = centerY * map.offsetHeight - viewport.clientHeight / 2;
  zoomOut.disabled = zoomReset.disabled = index === 0;
  zoomIn.disabled = index === zoomLevels.length - 1;
}

zoomOut.addEventListener('click', () => zoomTo(zoomIndex - 1));
zoomIn.addEventListener('click', () => zoomTo(zoomIndex + 1));
zoomReset.addEventListener('click', () => zoomTo(0));

async function fetchLandmarks(newLandmarks) {
  const options = newLandmarks ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newLandmarks)
  } : undefined;
  const response = await fetch(landmarksUrl, options);
  if (!response.ok) throw new Error('Landmark request failed.');
  return response.json();
}

async function loadLandmarks() {
  let localLandmarks;
  try {
    localLandmarks = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {
    // Shared landmarks are available even when browser storage is unavailable.
  }
  try {
    landmarks = await fetchLandmarks();
    renderLandmarks();
    if (Array.isArray(localLandmarks) && localLandmarks.length) {
      try {
        landmarks = await fetchLandmarks(localLandmarks);
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
  markers.replaceChildren();
  for (const landmark of landmarks) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.textContent = landmark.icon;
    pin.title = landmark.name;
    pin.setAttribute('aria-label', landmark.name);
    putAt(pin, landmark);
    pin.addEventListener('click', () => { status.textContent = landmark.name; });
    markers.append(pin);
  }
}

function stopAdding() {
  add.setAttribute('aria-pressed', 'false');
  draft.hidden = place.hidden = form.hidden = true;
  form.reset();
  add.focus();
}

add.addEventListener('click', () => {
  if (add.getAttribute('aria-pressed') === 'true') {
    stopAdding();
    status.textContent = '';
    return;
  }
  position = { x: 0.5, y: 0.5 };
  putAt(draft, position);
  add.setAttribute('aria-pressed', 'true');
  draft.hidden = place.hidden = false;
  status.textContent = 'Click or tap the map to place your landmark. With a keyboard, use the arrow keys and press Enter.';
  place.focus({ preventScroll: true });
});

place.addEventListener('keydown', (event) => {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  const [dx, dy] = direction;
  position.x = Math.max(0, Math.min(1, position.x + dx * 0.01));
  position.y = Math.max(0, Math.min(1, position.y + dy * 0.01));
  putAt(draft, position);
});

place.addEventListener('click', (event) => {
  if (event.detail > 0) {
    const bounds = map.getBoundingClientRect();
    position = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  }
  putAt(draft, position);
  form.hidden = false;
  place.hidden = true;
  status.textContent = '';
  form.elements.name.focus();
});

document.querySelector('#cancel').addEventListener('click', stopAdding);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (add.disabled) return;
  const name = form.elements.name.value.trim();
  if (!name) {
    status.textContent = 'Enter a landmark name.';
    form.elements.name.focus();
    return;
  }
  const landmark = { ...position, name, icon: form.elements.icon.value };
  const controls = [add, ...form.elements];
  for (const control of controls) control.disabled = true;
  try {
    landmarks = await fetchLandmarks([landmark]);
  } catch {
    status.textContent = 'The landmark could not be saved. Try again.';
    return;
  } finally {
    for (const control of controls) control.disabled = false;
  }
  renderLandmarks();
  stopAdding();
  status.textContent = `Saved ${name}.`;
});

void loadLandmarks();
