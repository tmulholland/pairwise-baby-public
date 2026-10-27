const form = document.querySelector('#freezer-form');
const nameInput = document.querySelector('#item-name');
const quantityInput = document.querySelector('#item-quantity');
const grid = document.querySelector('#freezer-grid');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#item-count');
const message = document.querySelector('#form-message');
const template = document.querySelector('#item-template');
const editDialog = document.querySelector('#edit-dialog');
const editForm = document.querySelector('#edit-form');
const editNameInput = document.querySelector('#edit-name');
const editQuantityInput = document.querySelector('#edit-quantity');
const editError = document.querySelector('#edit-error');
let activeEditItem = null;

const OPENMOJI_ROOT = 'https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.1.0/color/618x618';
const illustrations = [
  { words: ['pizza'], code: '1F355', label: 'pizza', emoji: '🍕' },
  { words: ['salmon', 'fish', 'cod', 'tilapia', 'trout'], code: '1F41F', label: 'fish', emoji: '🐟' },
  { words: ['tomato', 'marinara', 'red sauce'], code: '1F345', label: 'tomato', emoji: '🍅' },
  { words: ['rib', 'roast', 'steak', 'beef', 'patty', 'patties', 'meat'], code: '1F969', label: 'cut of meat', emoji: '🥩' },
  { words: ['hamburger', 'burger'], code: '1F354', label: 'hamburger', emoji: '🍔' },
  { words: ['chicken', 'poultry'], code: '1F357', label: 'chicken', emoji: '🍗' },
  { words: ['stock', 'broth', 'soup', 'stew', 'chili'], code: '1F372', label: 'pot of food', emoji: '🍲' },
  { words: ['bread', 'loaf', 'bun'], code: '1F35E', label: 'bread', emoji: '🍞' },
  { words: ['ice cream', 'gelato'], code: '1F368', label: 'ice cream', emoji: '🍨' },
  { words: ['fruit', 'berry', 'berries'], code: '1FAD0', label: 'blueberries', emoji: '🫐' },
  { words: ['vegetable', 'veggie', 'peas'], code: '1FADB', label: 'pea pod', emoji: '🫛' },
];
const fallback = { code: '1F9CA', label: 'ice cube', emoji: '🧊' };

function pickIllustration(name) {
  const normalized = name.toLowerCase();
  return illustrations.find((entry) => entry.words.some((word) => normalized.includes(word))) || fallback;
}

function imageUrl(code) {
  return `${OPENMOJI_ROOT}/${code}.png`;
}

function formatDate(createdAt) {
  const utcDate = new Date(`${createdAt.replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(utcDate);
}

function render(items) {
  grid.replaceChildren();
  count.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
  emptyState.hidden = items.length !== 0;

  for (const item of items) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.freezer-card');
    const art = pickIllustration(item.name);
    const image = fragment.querySelector('.item-illustration');
    const illustrationWrap = fragment.querySelector('.illustration-wrap');
    image.src = imageUrl(art.code);
    image.alt = `Cartoon ${art.label}`;
    image.addEventListener('error', () => {
      image.remove();
      illustrationWrap.textContent = art.emoji;
      illustrationWrap.classList.add('emoji-fallback');
      illustrationWrap.setAttribute('role', 'img');
      illustrationWrap.setAttribute('aria-label', `Cartoon ${art.label}`);
    }, { once: true });
    fragment.querySelector('.item-title').textContent = item.name;
    fragment.querySelector('.quantity-badge').textContent = item.quantity;
    const date = fragment.querySelector('.logged-date');
    date.textContent = `Added ${formatDate(item.createdAt)}`;
    date.dateTime = `${item.createdAt.replace(' ', 'T')}Z`;
    fragment.querySelector('.edit-button').addEventListener('click', () => editItem(item));
    fragment.querySelector('.delete-button').addEventListener('click', () => removeItem(item, card));
    grid.append(fragment);
  }
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

async function loadItems() {
  try {
    const data = await request('/api/freezer/items');
    render(data.items);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'form-message error';
  }
}

function editItem(item) {
  activeEditItem = item;
  editNameInput.value = item.name;
  editQuantityInput.value = item.quantity;
  editError.textContent = '';
  editError.className = 'form-message';
  editDialog.showModal();
  editQuantityInput.focus();
  editQuantityInput.select();
}

function closeEditDialog() {
  editDialog.close();
  activeEditItem = null;
}

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeEditItem) return;

  const submit = editForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const data = await request(`/api/freezer/items/${activeEditItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editNameInput.value, quantity: editQuantityInput.value }),
    });
    render(data.items);
    message.textContent = `${data.item.name} was updated. Its added date stayed the same.`;
    message.className = 'form-message success';
    closeEditDialog();
  } catch (error) {
    editError.textContent = error.message;
    editError.className = 'form-message error';
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#edit-close').addEventListener('click', closeEditDialog);
document.querySelector('#edit-cancel').addEventListener('click', closeEditDialog);
editDialog.addEventListener('click', (event) => {
  if (event.target === editDialog) closeEditDialog();
});

async function removeItem(item, card) {
  if (!window.confirm(`Remove “${item.name}” from the freezer?`)) return;
  card.classList.add('removing');
  try {
    const data = await request(`/api/freezer/items/${item.id}`, { method: 'DELETE' });
    render(data.items);
  } catch (error) {
    card.classList.remove('removing');
    message.textContent = error.message;
    message.className = 'form-message error';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  message.textContent = '';
  try {
    const data = await request('/api/freezer/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value, quantity: quantityInput.value }),
    });
    render(data.items);
    form.reset();
    nameInput.focus();
    message.textContent = `${data.item.name} is safely tucked away.`;
    message.className = 'form-message success';
  } catch (error) {
    message.textContent = error.message;
    message.className = 'form-message error';
  } finally {
    submit.disabled = false;
  }
});

loadItems();
