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
const API_BASE = document.body.dataset.apiBase || '/api/freezer/items';

const OPENMOJI_ROOT = 'https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.1.0/color/618x618';
const illustrations = [
  { words: ['pizza'], code: '1F355', label: 'pizza', emoji: '🍕' },
  { words: ['milk pop', 'breast milk', 'breastmilk', 'milk'], code: '1F95B', label: 'glass of milk', emoji: '🥛' },
  { words: ['jalapeño', 'jalapeno', 'hot pepper', 'chile pepper', 'chili pepper', 'pepper bite'], code: '1F336-FE0F', label: 'hot pepper', emoji: '🌶️' },
  { words: ['candy', 'sweet', 'taffy', 'gummy', 'gummies'], code: '1F36C', label: 'candy', emoji: '🍬' },
  { words: ['chocolate', 'fudge', 'brownie'], code: '1F36B', label: 'chocolate', emoji: '🍫' },
  { words: ['spaghetti', 'pasta', 'noodle', 'bolognese', 'alfredo', 'pesto', 'meat sauce'], code: '1F35D', label: 'spaghetti', emoji: '🍝' },
  { words: ['swiss cheese', 'cheese', 'cheddar', 'mozzarella', 'provolone'], code: '1F9C0', label: 'cheese wedge', emoji: '🧀' },
  { words: ['acai bowl', 'açaí bowl', 'bowl'], code: '1F963', label: 'bowl with spoon', emoji: '🥣' },
  { words: ['hamburger bun', 'burger bun'], code: '1F35E', label: 'bread', emoji: '🍞' },
  { words: ['chicken sausage', 'chicken breakfast sausage', 'turkey sausage', 'chicken'], code: '1F357', label: 'chicken', emoji: '🍗' },
  { words: ['bacon'], code: '1F953', label: 'bacon', emoji: '🥓' },
  { words: ['pork sausage', 'breakfast pork sausage', 'pork chop', 'pork', 'ham'], code: '1F416', label: 'pig', emoji: '🐖' },
  { words: ['hot dog'], code: '1F32D', label: 'hot dog', emoji: '🌭' },
  { words: ['sausage', 'brat', 'bratwurst'], code: '1F969', label: 'meat', emoji: '🥩' },
  { words: ['waffle'], code: '1F9C7', label: 'waffle', emoji: '🧇' },
  { words: ['pancake', 'flapjack'], code: '1F95E', label: 'pancakes', emoji: '🥞' },
  { words: ['egg', 'quiche', 'frittata'], code: '1F95A', label: 'egg', emoji: '🥚' },
  { words: ['bagel'], code: '1F96F', label: 'bagel', emoji: '🥯' },
  { words: ['burrito', 'enchilada', 'taquito', 'taco'], code: '1F32F', label: 'burrito', emoji: '🌯' },
  { words: ['sandwich', 'sub ', 'panini'], code: '1F96A', label: 'sandwich', emoji: '🥪' },
  { words: ['dumpling', 'potsticker', 'pierogi', 'wonton'], code: '1F95F', label: 'dumpling', emoji: '🥟' },
  { words: ['shrimp', 'prawn'], code: '1F364', label: 'shrimp', emoji: '🍤' },
  { words: ['salmon', 'fish', 'cod', 'tilapia', 'trout'], code: '1F41F', label: 'fish', emoji: '🐟' },
  { words: ['tomato', 'marinara', 'red sauce', 'pizza sauce'], code: '1F345', label: 'tomato', emoji: '🍅' },
  { words: ['hamburger', 'burger'], code: '1F354', label: 'hamburger', emoji: '🍔' },
  { words: ['rib', 'roast', 'steak', 'beef', 'patty', 'patties', 'meatball', 'meat'], code: '1F969', label: 'cut of meat', emoji: '🥩' },
  { words: ['poultry'], code: '1F357', label: 'chicken', emoji: '🍗' },
  { words: ['stock', 'broth', 'soup', 'stew', 'chili'], code: '1F372', label: 'pot of food', emoji: '🍲' },
  { words: ['rice', 'risotto'], code: '1F35A', label: 'rice', emoji: '🍚' },
  { words: ['french fry', 'fries', 'tater tot'], code: '1F35F', label: 'french fries', emoji: '🍟' },
  { words: ['potato', 'hash brown'], code: '1F954', label: 'potato', emoji: '🥔' },
  { words: ['broccoli'], code: '1F966', label: 'broccoli', emoji: '🥦' },
  { words: ['corn'], code: '1F33D', label: 'corn', emoji: '🌽' },
  { words: ['carrot'], code: '1F955', label: 'carrot', emoji: '🥕' },
  { words: ['onion'], code: '1F9C5', label: 'onion', emoji: '🧅' },
  { words: ['bread', 'loaf', 'bun'], code: '1F35E', label: 'bread', emoji: '🍞' },
  { words: ['butter'], code: '1F9C8', label: 'butter', emoji: '🧈' },
  { words: ['ice cream', 'gelato', 'sorbet'], code: '1F368', label: 'ice cream', emoji: '🍨' },
  { words: ['pie'], code: '1F967', label: 'pie', emoji: '🥧' },
  { words: ['cookie'], code: '1F36A', label: 'cookie', emoji: '🍪' },
  { words: ['cake', 'cupcake'], code: '1F370', label: 'cake', emoji: '🍰' },
  { words: ['strawberry'], code: '1F353', label: 'strawberry', emoji: '🍓' },
  { words: ['banana'], code: '1F34C', label: 'banana', emoji: '🍌' },
  { words: ['apple'], code: '1F34E', label: 'apple', emoji: '🍎' },
  { words: ['fruit', 'berry', 'berries', 'blueberry', 'blueberries'], code: '1FAD0', label: 'blueberries', emoji: '🫐' },
  { words: ['vegetable', 'veggie', 'peas'], code: '1FADB', label: 'pea pod', emoji: '🫛' },
];
const fallback = { code: '1F9CA', label: 'ice cube', emoji: '🧊' };

function pickIllustration(name) {
  const normalized = normalizeSearchText(name);
  return illustrations.find((entry) => entry.words.some((word) => matchesFoodTerm(normalized, word))) || fallback;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesFoodTerm(normalizedName, term) {
  const normalizedTerm = normalizeSearchText(term);
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pluralSuffix = normalizedTerm.endsWith('s') ? '' : '(?:s|es)?';
  return new RegExp(`(?:^|[^a-z0-9])${escapedTerm}${pluralSuffix}(?=$|[^a-z0-9])`).test(normalizedName);
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
    const data = await request(API_BASE);
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
    const data = await request(`${API_BASE}/${activeEditItem.id}`, {
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
    const data = await request(`${API_BASE}/${item.id}`, { method: 'DELETE' });
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
    const data = await request(API_BASE, {
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
