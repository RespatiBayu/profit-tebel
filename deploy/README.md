# VPS Deploy

This app can run on a plain Ubuntu VPS with Node.js 20, `systemd`, and Nginx.

## Server layout

- App directory: `/var/www/profit-tebel`
- Process manager: `systemd`
- Reverse proxy: Nginx
- App port: `3000`

## Environment

Create `/var/www/profit-tebel/.env.local` on the server.

Required variables:

- `DATABASE_URL`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_DAYS`
- `SUPERADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `MIDTRANS_SERVER_KEY`
- `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`
- `MIDTRANS_IS_PRODUCTION`
- `ADMIN_EMAILS`

For a domain-based deploy, set:

```env
NEXT_PUBLIC_APP_URL=https://profitebel.id
DATABASE_URL=postgres://profit_tebel:strong-password@127.0.0.1:5432/profit_tebel
```

## Database

This deploy uses the VPS Postgres database directly. Initialize a fresh database with:

```bash
sudo -u postgres createuser profit_tebel
sudo -u postgres createdb profit_tebel -O profit_tebel
sudo -u postgres psql -c "alter user profit_tebel with password 'strong-password';"
psql "$DATABASE_URL" -f server/migrations/001_init.sql
```

Create the first superadmin account from the app/admin tooling, or run the demo script after setting `DATABASE_URL`:

```bash
npx tsx scripts/create-demo-account.ts
```

Cloudflare DNS records:

- `A` record for `@` -> `43.157.204.236`
- `A` record for `www` -> `43.157.204.236`

You can keep Cloudflare proxy enabled after HTTPS is working.

## First deploy

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg nginx postgresql postgresql-contrib

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list > /dev/null
sudo apt-get update
sudo apt-get install -y nodejs

sudo mkdir -p /var/www
sudo chown "$USER:$USER" /var/www
git clone -b production https://github.com/RespatiBayu/profit-tebel.git /var/www/profit-tebel

cd /var/www/profit-tebel
npm ci
npm run build
```

Install the included configs:

```bash
sudo cp deploy/profit-tebel.service /etc/systemd/system/profit-tebel.service
sudo cp deploy/profit-tebel.nginx.conf /etc/nginx/conf.d/profit-tebel.conf

sudo systemctl daemon-reload
sudo systemctl enable --now profit-tebel
sudo nginx -t
sudo systemctl reload nginx

sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d profitebel.id -d www.profitebel.id
```

## Update deploy

```bash
cd /var/www/profit-tebel
git pull origin production
npm ci
npm run build
sudo systemctl restart profit-tebel
```

## Logs

```bash
sudo journalctl -u profit-tebel -n 100 --no-pager
sudo journalctl -u profit-tebel -f
```
