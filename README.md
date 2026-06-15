# Vencimentos — Bot WhatsApp + App Web

Sistema com dois componentes que compartilham o mesmo banco de dados (SQLite):

1. **Bot WhatsApp** (`/bot`) — cadastre boletos e receba alertas no WhatsApp via Z-API.
2. **App Web** (`/webapp`) — agenda visual compartilhada pelo time, com notificações push do navegador.

---

## 1. Instalação

Requer **Node.js 18+**.

```bash
cd boletos-bot
npm install
```

Copie o arquivo de configuração:

```bash
cp .env.example .env
```

---

## 2. Configurar o bot do WhatsApp (Z-API)

1. Crie uma conta em https://www.z-api.io (tem plano pago, é o serviço mais simples no Brasil).
2. Crie uma instância e conecte seu WhatsApp escaneando o QR code no painel.
3. No painel da instância, copie:
   - `Instance ID`
   - `Token`
   - `Client-Token` (em Segurança)
4. Preencha no `.env`:

```env
ZAPI_INSTANCE_ID=...
ZAPI_TOKEN=...
ZAPI_CLIENT_TOKEN=...
NUMEROS_AUTORIZADOS=5511999999999,5511888888888
```

`NUMEROS_AUTORIZADOS` são os números (com DDI 55) que podem usar o bot e que recebem os lembretes. Pode ser um time inteiro.

### Configurar o Webhook

Depois de subir o bot (passo 4), no painel da Z-API, em **Webhooks > Ao receber mensagem**, configure a URL pública do seu servidor:

```
https://SEU_DOMINIO/webhook
```

> Como o Z-API precisa acessar essa URL pela internet, você precisa hospedar o bot em algum servidor com domínio/IP público (Railway, Render, VPS, etc.) — não funciona em `localhost` sem um túnel (ex: ngrok para testes).

---

## 3. Configurar notificações push do app web

Gere as chaves VAPID (uma vez só):

```bash
npx web-push generate-vapid-keys
```

Copie as duas chaves geradas para o `.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:seuemail@exemplo.com
```

---

## 4. Rodando o sistema

```bash
# Roda os dois (bot + app web) ao mesmo tempo
npm start

# Ou separadamente:
npm run bot   # bot WhatsApp na porta 3001 (BOT_PORT no .env)
npm run web   # app web na porta 3000 (PORT no .env)
```

Acesse o app web em `http://localhost:3000` (ou o domínio onde estiver hospedado).

---

## 5. Como usar o bot pelo WhatsApp

Envie mensagens do número autorizado para o número conectado na instância Z-API.

### Cadastrar um boleto
```
/novo Empresa | Valor | DD/MM/AAAA
```
Exemplo:
```
/novo Energisa | 250,90 | 20/06/2026
```

### Listar boletos em aberto
```
/listar
```

### Marcar como pago
```
/pago 3
```
(use o ID mostrado em `/listar`)

### Excluir
```
/excluir 3
```

### Ajuda
```
/ajuda
```

---

## 6. Notificação automática de vencimento

Todos os dias, no horário definido em `CRON_HORARIO` (padrão 08:00, formato cron — horário do servidor), o sistema verifica os boletos que vencem **hoje** e:

- envia mensagem no WhatsApp para todos os `NUMEROS_AUTORIZADOS`;
- envia notificação push para quem ativou no app web (botão "Ativar notificações").

Cada boleto só é notificado uma vez por dia de vencimento.

---

## 7. Hospedagem (sugestão simples e gratuita)

- **Railway** ou **Render**: suba o repositório, defina as variáveis de ambiente do `.env` no painel, e exponha a porta do app web. Para o webhook do Z-API funcionar, o bot também precisa ficar acessível publicamente (pode rodar ambos no mesmo serviço com `npm start`, expondo as duas portas, ou usar um único processo — me avise se quiser que eu unifique tudo em um único servidor/porta).

---

## 8. Estrutura de arquivos

```
boletos-bot/
├── db.js              # configuração do banco SQLite
├── boletos.js         # funções compartilhadas (criar, listar, etc.)
├── .env.example
├── bot/
│   ├── index.js        # servidor do bot (webhook + cron)
│   └── zapi.js          # integração com Z-API
└── webapp/
    ├── server.js        # API REST + push + cron
    └── public/
        ├── index.html
        ├── style.css
        ├── app.js
        └── sw.js          # service worker (push)
```

---

## Observações

- O banco `boletos.db` é criado automaticamente na primeira execução, na raiz do projeto.
- O app web é **compartilhado**: todos que acessarem a URL veem a mesma lista de boletos (time todo).
- Valores aceitam vírgula ou ponto como separador decimal (ex: `250,90` ou `250.90`).
