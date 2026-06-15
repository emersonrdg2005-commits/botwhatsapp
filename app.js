const form = document.getElementById('form-novo');
const formMsg = document.getElementById('form-msg');
const lista = document.getElementById('lista');
const tabs = document.querySelectorAll('.tab');
const btnNotif = document.getElementById('btn-notif');

let filtroAtual = 'abertos';

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(isoStr) {
  const [a, m, d] = isoStr.split('-');
  return `${d}/${m}/${a}`;
}

function diasParaVencimento(isoStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(isoStr + 'T00:00:00');
  return Math.round((venc - hoje) / 86400000);
}

async function carregarLista() {
  const abertos = filtroAtual === 'abertos' ? '1' : '0';
  const res = await fetch(`/api/boletos?abertos=${abertos}`);
  const boletos = await res.json();

  if (boletos.length === 0) {
    lista.innerHTML = `<div class="empty-state">Nenhum boleto encontrado. Adicione um lançamento acima.</div>`;
    return;
  }

  lista.innerHTML = boletos.map((b) => {
    const dias = diasParaVencimento(b.vencimento);
    let classeItem = '';
    let classeData = '';
    let labelData = `Vence em ${formatarDataBR(b.vencimento)}`;

    if (b.pago) {
      classeItem = 'pago';
    } else if (dias < 0) {
      classeItem = 'atrasado';
      classeData = 'alerta';
      labelData = `Venceu em ${formatarDataBR(b.vencimento)} (${Math.abs(dias)}d atrás)`;
    } else if (dias === 0) {
      classeItem = 'vence-hoje';
      classeData = 'destaque';
      labelData = `Vence hoje (${formatarDataBR(b.vencimento)})`;
    } else if (dias <= 3) {
      classeData = 'destaque';
      labelData = `Vence em ${dias}d — ${formatarDataBR(b.vencimento)}`;
    }

    return `
      <div class="item ${classeItem}" data-id="${b.id}">
        <div class="item-main">
          <span class="item-empresa">${escapeHtml(b.empresa)}</span>
          <span class="item-data ${classeData}">${labelData}</span>
        </div>
        <div class="item-right">
          <span class="item-valor">${formatarMoeda(b.valor)}</span>
          <div class="item-actions">
            ${!b.pago ? `<button class="icon-btn confirm" title="Marcar como pago" data-action="pago" data-id="${b.id}">✓</button>` : ''}
            <button class="icon-btn remove" title="Excluir" data-action="excluir" data-id="${b.id}">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

lista.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'pago') {
    await fetch(`/api/boletos/${id}/pago`, { method: 'POST' });
  } else if (action === 'excluir') {
    if (!confirm('Excluir este boleto?')) return;
    await fetch(`/api/boletos/${id}`, { method: 'DELETE' });
  }
  carregarLista();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    filtroAtual = tab.dataset.filter;
    carregarLista();
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMsg.textContent = '';
  formMsg.className = 'form-msg';

  const empresa = document.getElementById('empresa').value.trim();
  const valor = document.getElementById('valor').value.trim();
  const vencimentoInput = document.getElementById('vencimento').value; // YYYY-MM-DD
  const [ano, mes, dia] = vencimentoInput.split('-');
  const vencimentoBR = `${dia}/${mes}/${ano}`;

  const res = await fetch('/api/boletos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresa, valor, vencimento: vencimentoBR }),
  });

  const data = await res.json();

  if (!res.ok) {
    formMsg.textContent = data.error || 'Erro ao salvar.';
    formMsg.className = 'form-msg error';
    return;
  }

  formMsg.textContent = 'Boleto adicionado à agenda.';
  formMsg.className = 'form-msg success';
  form.reset();
  carregarLista();
});

// ---- Push notifications ----

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function ativarNotificacoes() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Seu navegador não suporta notificações push.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Permissão de notificação negada.');
    return;
  }

  const reg = await navigator.serviceWorker.register('/sw.js');
  const { publicKey } = await (await fetch('/api/vapid-public-key')).json();

  if (!publicKey) {
    alert('Chaves VAPID não configuradas no servidor. Veja o README.');
    return;
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });

  btnNotif.textContent = 'Notificações ativadas';
  btnNotif.classList.add('active');
}

btnNotif.addEventListener('click', ativarNotificacoes);

// Verifica se já está inscrito
(async () => {
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        btnNotif.textContent = 'Notificações ativadas';
        btnNotif.classList.add('active');
      }
    }
  }
})();

carregarLista();
