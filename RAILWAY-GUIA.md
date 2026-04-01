# 🚀 ORGANIZE — Publicar no Railway (grátis)
## Em 5 passos você terá um link público para todos acessarem

---

## Antes de começar

Você vai precisar de:
- Uma conta no **GitHub** (gratuita) → https://github.com
- Uma conta no **Railway** (gratuita) → https://railway.app

---

## PASSO 1 — Criar conta no GitHub

1. Acesse https://github.com e clique em **Sign up**
2. Crie sua conta (é grátis)
3. Confirme seu e-mail

---

## PASSO 2 — Criar repositório no GitHub

1. Após entrar no GitHub, clique no **"+"** no canto superior direito
2. Clique em **"New repository"**
3. Nome: `organize-sistema`
4. Marque como **Private** (privado)
5. Clique em **"Create repository"**

Agora envie os arquivos:
1. Na página do repositório, clique em **"uploading an existing file"**
2. Arraste os 4 arquivos:
   - `servidor.js`
   - `organize.html`
   - `package.json`
   - `railway.toml`
3. Clique em **"Commit changes"**

---

## PASSO 3 — Criar conta no Railway

1. Acesse https://railway.app
2. Clique em **"Login"** → **"Login with GitHub"**
3. Autorize o Railway a acessar seu GitHub

---

## PASSO 4 — Publicar o sistema

1. No Railway, clique em **"New Project"**
2. Clique em **"Deploy from GitHub repo"**
3. Selecione o repositório `organize-sistema`
4. Railway vai detectar automaticamente e começar a instalar

Aguarde ~2 minutos. Vai aparecer ✅ **"Deployed"**

---

## PASSO 5 — Configurar volume de dados (IMPORTANTE!)

Para os dados não se perderem:

1. Clique no seu serviço no Railway
2. Vá na aba **"Volumes"**
3. Clique em **"Add Volume"**
4. Mount Path: `/data`
5. Clique em **"Add"**
6. Railway vai reiniciar automaticamente

---

## PASSO 6 — Pegar o link público

1. Vá na aba **"Settings"** do seu serviço
2. Em **"Networking"** clique em **"Generate Domain"**
3. Vai gerar um link tipo: `organize-sistema-production.up.railway.app`

✅ **Pronto!** Esse link funciona para todos os usuários, de qualquer lugar.

---

## PRIMEIRO ACESSO

1. Abra o link gerado pelo Railway
2. Vai aparecer a tela **"🚀 Primeiro acesso!"**
3. Crie seu usuário administrador
4. Compartilhe o link com sua equipe

---

## ATUALIZAR O SISTEMA (quando houver nova versão)

1. No GitHub, vá no repositório
2. Clique no arquivo que quer atualizar → clique no lápis ✏️ → cole o novo conteúdo → **"Commit changes"**
3. Railway detecta automaticamente e publica em ~1 minuto
4. **Os dados do banco nunca são apagados** ✅

---

## PLANO GRATUITO DO RAILWAY

- ✅ 500 horas/mês de execução (suficiente para uso contínuo)
- ✅ 1 GB de volume persistente
- ✅ SSL (https) automático
- ✅ Link público automático
- ⚠️ Se ultrapassar, plano pago começa em ~$5/mês

---

## DÚVIDAS FREQUENTES

**O sistema ficou offline?**
→ Verifique em railway.app se o deploy está ativo. Clique em "Redeploy" se necessário.

**Perdi meus dados?**
→ Os dados ficam no volume `/data`. Só são perdidos se você deletar o volume manualmente.

**Como fazer backup?**
→ Dentro do sistema, vá em **Relatórios → Fazer Backup Agora**. 
→ Ou acesse o volume pelo Railway e baixe o arquivo `organize.db`.

**Quero usar meu próprio domínio?**
→ No Railway, vá em Settings → Networking → Custom Domain → coloque seu domínio.
