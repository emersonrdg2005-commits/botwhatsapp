self.addEventListener('push', (event) => {
  let data = { title: 'Vencimentos', body: 'Você tem um lembrete de boleto.' };
  try {
    data = event.data.json();
  } catch (e) {
    // mantém o padrão
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/icon-512.png',
      badge: '/assets/icon-512.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientsArr) => {
      if (clientsArr.length > 0) {
        clientsArr[0].focus();
      } else {
        clients.openWindow('/');
      }
    })
  );
});
