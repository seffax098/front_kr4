const output = document.querySelector('#output');

function print(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

function on(selector, eventName, handler) {
  const element = document.querySelector(selector);
  if (element) element.addEventListener(eventName, handler);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const body = await response.json().catch(() => ({ raw: 'No JSON body' }));
  print({ status: response.status, body });
}

on('#btn-products', 'click', () => request('/api/products'));
on('#btn-users', 'click', () => request('/api/users'));

on('#user-form', 'submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await request('/api/users', {
    method: 'POST',
    body: JSON.stringify({
      first_name: form.get('first_name'),
      last_name: form.get('last_name'),
      age: Number(form.get('age')),
      profile: {
        contacts: { email: form.get('email') },
        interests: String(form.get('interests')).split(',').map((item) => item.trim()).filter(Boolean),
        preferences: { interface: 'web-ui' }
      }
    })
  });
});

on('#product-form', 'submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await request('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: form.get('name'),
      price: Number(form.get('price')),
      description: form.get('description'),
      document: {
        tags: String(form.get('tags')).split(',').map((item) => item.trim()).filter(Boolean),
        stock: 15,
        attributes: { createdFrom: 'web-ui' }
      }
    })
  });
});
