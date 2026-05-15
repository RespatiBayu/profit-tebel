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

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `MIDTRANS_SERVER_KEY`
- `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`
- `MIDTRANS_IS_PRODUCTION`
- `ADMIN_EMAILS`

For a domain-based deploy, set:

```env
NEXT_PUBLIC_APP_URL=https://profitebel.id
```

Cloudflare DNS records:

- `A` record for `@` -> `43.157.204.236`
- `A` record for `www` -> `43.157.204.236`

You can keep Cloudflare proxy enabled after HTTPS is working.

## First deploy

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg nginx

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
