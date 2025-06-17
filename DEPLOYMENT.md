# DEPLOYMENT.md
RoadDesignApp – Server Deployment Guide  
Version 1.0 • Last updated 2025-06-17  

---

## 1  Overview  
This guide shows how to deploy the complete **RoadDesignApp** stack to a fresh Linux server for evaluation or staging.  
Two options are covered:

1. **Docker Compose** – single-host, easiest way to get started.  
2. **Kubernetes (K8s)** – production-grade, scalable deployment (optional).

The same container images are used for both approaches.

---

## 2  Prerequisites  

| Requirement | Minimum (test) | Recommended (prod) |
|-------------|----------------|--------------------|
| OS          | Ubuntu 22.04 LTS / Rocky 9 / Debian 12 | Latest LTS |
| CPU         | 4 vCPU         | 8 vCPU+ |
| RAM         | 8 GB           | 16 GB+ |
| Disk        | 50 GB SSD      | 200 GB NVMe |
| Ports open  | 80, 443, 22    | same + 9000/9001 (MinIO admin) |
| Domain      | `roadapp.test.local` or IP | FQDN w/ TLS |
| Docker      | 24.x           | — |
| Docker Compose v2 plugin | ✓ | — |

> GPU is optional. If present and the NVIDIA driver + `nvidia-container-toolkit` are installed, the flow-simulation service will auto-detect it.

---

## 3  Getting the Package  

```bash
git clone https://github.com/your-org/road-design-app.git
cd road-design-app
```

Directory snapshot:

```
infra/
 ├─ docker-compose.yml       ← stack definition
 ├─ .env.sample              ← environment template
 └─ nginx/                   ← reverse-proxy config & TLS certs
frontend/                    ← React SPA
services/                    ← API & micro-services
setup.sh                     ← helper script
```

---

## 4  Quick Start (Docker Compose)

### 4.1 System preparation

```bash
sudo apt update
sudo apt install -y curl git
curl -fsSL https://get.docker.com | sudo bash
newgrp docker               # activate docker group
```

### 4.2 Run helper script

```bash
./setup.sh                  # creates folders, sample SSL certs, copies .env
nano infra/.env             # review & change secrets
```

### 4.3 Start the stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml pull   # pull images
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

### 4.4 Initialise database & Keycloak

```bash
docker compose exec api-gateway yarn migration:run
docker compose exec api-gateway yarn seed
# (optional) import Keycloak realm:
# browse https://<DOMAIN>/auth  → Admin → Import realm-export.json
```

---

## 5  Verifying the Deployment  

| Check | Command / URL | Expect |
|-------|---------------|--------|
| Containers running | `docker compose ps` | STATUS = “Up” |
| API health | `curl -k https://<DOMAIN>/api/health` | `{"status":"ok"}` |
| Frontend | https://\<DOMAIN\> | Login page |
| MinIO | https://\<DOMAIN\>/minio-console/ | Console login |
| Keycloak | https://\<DOMAIN\>/auth | Keycloak UI |

Create an admin account via Keycloak or the sign-up link, then:

1. Create a *Project*.  
2. Upload `samples/dem_utm33.tif` in *Surfaces → Import Terrain*.  
3. Draw a simple alignment; generate 3-D model.  
4. Open *Cost* tab – CSV download should succeed.

---

## 6  Stopping & Removing

```bash
docker compose down -v --remove-orphans   # stop & wipe volumes
```

---

## 7  Kubernetes Deployment (outline)

1. Install K3s / kubeadm or use a managed cluster.  
2. `kubectl create ns roadapp`  
3. `kubectl create secret generic roadapp-env --from-env-file=infra/.env -n roadapp`  
4. Install backing services (Postgres, Redis, MinIO) via Helm or cloud equivalents.  
5. Apply manifests:

```bash
kubectl apply -k infra/k8s/overlays/staging   # or prod
kubectl rollout status deploy/api-gateway -n roadapp
```

6. Configure Ingress + cert-manager for HTTPS.

---

## 8  Troubleshooting  

| Symptom | Action |
|---------|--------|
| **502 Bad Gateway** | `docker logs roadapp-nginx` – verify upstream containers healthy. |
| **DB auth failed** | Check `POSTGRES_*` vars match `.env`; ensure `pg_isready` passes. |
| **MinIO Access Denied** | Correct `MINIO_ROOT_USER/PASSWORD`; restart `minio`. |
| **Keycloak 404** | Wait for Keycloak to finish boot (1-2 min); check `docker logs`. |
| **Flow-sim stuck** | GPU missing? set `ENABLE_GPU=false` (infra/.env) and restart `drainage-suite`. |
| High RAM usage | Reduce `MAX_WORKER_THREADS` & `TERRAIN_MEMORY_LIMIT` in `.env`. |
| Port clash 443 | Change host ports in `docker-compose.yml` or stop other HTTPS services. |

---

## 9  Hardening for Production  

1. Replace self-signed certs in `infra/nginx/certs/` with CA-issued certs.  
2. Move Postgres & MinIO to managed HA services.  
3. Add backups: nightly `pg_dumpall` + `mc mirror` to off-site storage.  
4. Enable autoscaling: `kubectl autoscale deploy api-gateway -n roadapp --cpu-percent=70 --min=2 --max=10`.  
5. Put Cloudflare / AWS WAF in front of Ingress.  
6. Monitor: deploy Prometheus + Grafana (manifests in `infra/k8s/monitoring/`).  

---

## 10  Support  

• GitHub Issues: https://github.com/your-org/road-design-app/issues  
• Community Slack: https://roadapp.slack.com  

Happy designing!
