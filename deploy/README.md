# Production Deployment

This stack keeps the whole app on one Ubuntu VPS:

- `web`: Caddy serving the frontend and reverse-proxying `/api`
- `api`: Node/Express API
- `db`: PostgreSQL
- `sidecar`: Python FastAPI generation service

## First launch shape

The fastest path is:

1. provision one Ubuntu x86_64 VPS
2. launch on the server IP over HTTP first
3. switch to a real hostname later for HTTPS

Expected optional model files:

- `models/surrogate.onnx`
- `models/cvae.pt`

If those files are missing, the stack still boots:

- `/api/predict` falls back to the physics engine
- `/api/generate` returns model-unavailable responses

## Server bootstrap

Run this once on the VPS:

```bash
sudo ./deploy/bootstrap-ubuntu-vps.sh
```

Then open inbound TCP ports `80` and `443` in your cloud firewall.

## First deployment on the server IP

```bash
git checkout main
cp deploy/.env.production.example deploy/.env.production
mkdir -p models
```

Edit `deploy/.env.production`:

- set `APP_DOMAIN` to the server IP only, with no scheme
- set `PUBLIC_ORIGIN` to `http://<server-ip>`
- leave `VITE_API_URL` empty for same-origin frontend calls
- replace `POSTGRES_PASSWORD`
- update `ML_MODEL_VERSION` to the surrogate build you are deploying

Then launch:

```bash
./deploy/launch-production.sh
```

The script validates the env file, builds the stack, runs the DB schema push, starts every service, and prints the health URLs.

## Health checks

After launch, verify:

- `http://<server-ip>/api/healthz`
- `http://<server-ip>/api/predict/status`
- `http://<server-ip>/api/generate/status`
- `http://<server-ip>/api/ml`

Then open `http://<server-ip>/` in a browser and confirm the simulator UI loads.

## Domain cutover later

When you have a real hostname:

1. point the hostname at the VPS
2. change `APP_DOMAIN` to the hostname
3. change `PUBLIC_ORIGIN` to `https://<hostname>`
4. rerun `./deploy/launch-production.sh`

Caddy will switch from HTTP-only mode to automatic HTTPS once the hostname resolves publicly.

## Updating production

```bash
git pull
./deploy/launch-production.sh
```
