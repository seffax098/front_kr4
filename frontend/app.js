const output = document.querySelector('#output');

function print(data) {
  output.textContent = JSON.stringify(data, null, 2);
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

document.querySelector('#btn-root').addEventListener('click', () => request('/'));
document.querySelector('#btn-status').addEventListener('click', () => request('/api/status'));
document.querySelector('#btn-products').addEventListener('click', () => request('/api/products'));
document.querySelector('#btn-users').addEventListener('click', () => request('/api/users'));

document.querySelector('#user-form').addEventListener('submit', async (event) => {
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

document.querySelector('#product-form').addEventListener('submit', async (event) => {
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
