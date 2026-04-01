# 📦 ORGANIZE — Guia de Instalação no VPS
## Tempo estimado: 10-15 minutos

---

## PASSO 1 — Conectar no servidor

Abra o terminal (ou PuTTY no Windows) e acesse seu VPS:

```bash
ssh root@SEU-IP-DO-SERVIDOR
```

---

## PASSO 2 — Instalar Node.js (se não tiver)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

Verificar se instalou:
```bash
node --version   # deve mostrar v20.x.x
npm --version    # deve mostrar 10.x.x
```

---

## PASSO 3 — Criar pasta do sistema

```bash
mkdir -p /var/www/organize
cd /var/www/organize
```

---

## PASSO 4 — Enviar os arquivos para o servidor

No seu computador, use o FileZilla, WinSCP ou scp para enviar:
- `servidor.js`
- `package.json`
- `organize.html`

Para enviar via terminal (do seu computador local):
```bash
scp servidor.js package.json organize.html root@SEU-IP:/var/www/organize/
```

---

## PASSO 5 — Instalar dependências

```bash
cd /var/www/organize
npm install
```

---

## PASSO 6 — Testar o servidor

```bash
node servidor.js
```

Deve aparecer:
```
✅ Organize Server rodando na porta 3000
   Acesse: http://localhost:3000
   Banco:  /var/www/organize/data/organize.db
   Backups: /var/www/organize/backups
```

Acesse no navegador: `http://SEU-IP:3000`

---

## PASSO 7 — Rodar em segundo plano (PM2)

Para o sistema ficar rodando sempre, mesmo após fechar o terminal:

```bash
npm install -g pm2
pm2 start servidor.js --name organize
pm2 startup          # copie e execute o comando que aparecer
pm2 save
```

Comandos úteis PM2:
```bash
pm2 status           # ver status
pm2 logs organize    # ver logs em tempo real
pm2 restart organize # reiniciar
pm2 stop organize    # parar
```

---

## PASSO 8 — Liberar porta no firewall (se necessário)

```bash
ufw allow 3000
```

---

## PASSO 9 (OPCIONAL) — Usar porta 80 com domínio (Nginx)

Se quiser acessar pelo domínio sem precisar digitar :3000:

```bash
apt install nginx -y
```

Criar configuração:
```bash
nano /etc/nginx/sites-available/organize
```

Colar este conteúdo (substituir SEU-DOMINIO):
```nginx
server {
    listen 80;
    server_name SEU-DOMINIO.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar:
```bash
ln -s /etc/nginx/sites-available/organize /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## ESTRUTURA DE ARQUIVOS NO SERVIDOR

```
/var/www/organize/
├── servidor.js          ← servidor principal
├── organize.html        ← frontend (servido automaticamente)
├── package.json
├── node_modules/
├── data/
│   └── organize.db      ← banco de dados SQLite
└── backups/
    ├── organize_2026-04-01_backup.db
    ├── organize_2026-04-01_auto.db
    └── ...              ← backups automáticos
```

---

## ATUALIZAR O SISTEMA (sem perder dados)

Para atualizar o sistema com nova versão:

```bash
cd /var/www/organize
# Envie os novos arquivos (servidor.js e organize.html)
scp servidor.js organize.html root@SEU-IP:/var/www/organize/

# Reiniciar
pm2 restart organize
```

✅ Os dados ficam em `data/organize.db` — **nunca são apagados na atualização**.

---

## BACKUP MANUAL

Dentro do sistema, vá em **Relatórios** e clique em **"Fazer Backup Agora"**.

Ou direto no servidor:
```bash
cp /var/www/organize/data/organize.db /var/www/organize/backups/manual-$(date +%Y%m%d).db
```

---

## PROBLEMAS COMUNS

**Erro: "EACCES permission denied"**
```bash
chown -R root:root /var/www/organize
```

**Porta 3000 já em uso**
```bash
lsof -i :3000
kill -9 PID_DO_PROCESSO
```

**Servidor não abre no navegador**
```bash
ufw allow 3000
ufw status
```

---

## SUPORTE

Em caso de dúvidas, verifique os logs:
```bash
pm2 logs organize --lines 50
```
