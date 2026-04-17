const LAST_ACTIVE_USER_KEY = 'baby-name-last-active-user';
const USER_CONFIRM_PREFIX = 'baby-name-confirmed-user:';

const elements = {
  form: document.querySelector('#start-form'),
  nameInput: document.querySelector('#start-name'),
  error: document.querySelector('#start-error'),
};

elements.form.addEventListener('submit', handleStartSubmit);

async function handleStartSubmit(event) {
  event.preventDefault();

  const slug = normalizeSlug(elements.nameInput.value);

  if (!slug) {
    showError('Enter your name to start ranking.');
    elements.nameInput.focus();
    return;
  }

  setSubmitting(true);
  showError('');

  try {
    const payload = await apiFetchJson('/api/users', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
    const userSlug = payload.user.slug;
    window.localStorage.setItem(LAST_ACTIVE_USER_KEY, userSlug);
    window.localStorage.setItem(`${USER_CONFIRM_PREFIX}${userSlug}`, 'true');
    window.location.href = `/${userSlug}`;
  } catch (error) {
    showError(error.message);
    setSubmitting(false);
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

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.classList.toggle('hidden', !message);
}

function setSubmitting(isSubmitting) {
  elements.form.querySelector('button').disabled = isSubmitting;
  elements.nameInput.disabled = isSubmitting;
}
