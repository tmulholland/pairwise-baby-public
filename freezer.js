const form = document.querySelector('#freezer-form');
const nameInput = document.querySelector('#item-name');
const quantityInput = document.querySelector('#item-quantity');
const grid = document.querySelector('#freezer-grid');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#item-count');
const message = document.querySelector('#form-message');
const template = document.querySelector('#item-template');

const OPENMOJI_ROOT = 'https://cdn.jsdelivr.net/npm/openmoji@15.1.0/color/618x618';
const illustrations = [
  { words: ['pizza'], code: '1F355', label: 'pizza' },
  { words: ['salmon', 'fish', 'cod', 'tilapia', 'trout'], code: '1F41F', label: 'fish' },
  { words: ['tomato', 'marinara', 'red sauce'], code: '1F345', label: 'tomato' },
  { words: ['rib', 'roast', 'steak', 'beef', 'patty', 'patties', 'meat'], code: '1F969', label: 'cut of meat' },
  { words: ['hamburger', 'burger'], code: '1F354', label: 'hamburger' },
  { words: ['chicken', 'poultry'], code: '1F357', label: 'chicken' },
  { words: ['stock', 'broth', 'soup', 'stew', 'chili'], code: '1F372', label: 'pot of food' },
  { words: ['bread', 'loaf', 'bun'], code: '1F35E', label: 'bread' },
  { words: ['ice cream', 'gelato'], code: '1F368', label: 'ice cream' },
  { words: ['fruit', 'berry', 'berries'], code: '1FAD0', label: 'blueberries' },
  { words: ['vegetable', 'veggie', 'peas'], code: '1FADB', label: 'pea pod' },
];
const fallback = { code: '1F9CA', label: 'ice cube' };

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
    image.src = imageUrl(art.code);
    image.alt = `Cartoon ${art.label}`;
    fragment.querySelector('.item-title').textContent = item.name;
    fragment.querySelector('.quantity-badge').textContent = item.quantity;
    const date = fragment.querySelector('.logged-date');
    date.textContent = `Added ${formatDate(item.createdAt)}`;
    date.dateTime = `${item.createdAt.replace(' ', 'T')}Z`;
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
