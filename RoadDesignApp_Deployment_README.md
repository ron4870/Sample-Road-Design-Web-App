# RoadDesignApp – Deployment Guide  
File: `RoadDesignApp_Deployment_README.md`  
Version 1.0 • Last updated 2025-06-17  

---

## 1  Overview  
This document explains how to deploy **RoadDesignApp** to a fresh Linux server (Ubuntu 22.04 LTS, Rocky 9, or Debian 12). Two deployment options are covered:  

1. **Docker Compose** – single-host evaluation / staging.  
2. **Kubernetes** – production-grade, horizontally scalable.  

Both options use the same container images and environment variables.  

---

## 2  Repository Structure (package root)  

```
road-design-app/
├── frontend/                 # React + Three.js SPA
├── services/
│   ├── api-gateway/          # NestJS REST/GraphQL
│   ├── alignment-engine/     # Go
│   ├── model-service/        # Rust (WASM/native)
│   ├── terrain-service/      # Python GDAL
│   ├── cost-estimator/       # Python FastAPI
│   ├── junction-engine/      # Go
│   ├── signage-engine/       # Go
│   ├── drainage-suite/       # Py/Rust
│   └── grading-engine/       # C++/Go
├── infra/
│   ├── docker-compose.yml
│   ├── .env.sample
│   └── k8s/
│       ├── base/             # Kustomize base manifests
│       └── overlays/
│           ├── staging/
│           └── prod/
└── docs/                     # Architecture, modules, API
```  

---

## 3  Server Requirements  

| Resource                | Minimum (evaluation) | Recommended (prod) |
|-------------------------|----------------------|--------------------|
| CPU                     | 4 vCPU               | 8+ vCPU (x86-64)   |
| RAM                     | 8 GB                 | 16–32 GB           |
| Disk                    | 50 GB SSD            | 200 GB NVMe        |
| OS                      | Ubuntu 22.04 LTS     | Ubuntu/Rocky latest|
| GPU (optional)          | —                    | NVIDIA w/ CUDA for flow-sim |
| Public ports            | 80, 443, 22          | same + 9000 (MinIO admin) |
| Domain                  | roadapp.test.local   | FQDN w/ TLS cert   |

The stack is fully containerised; the host only needs Docker/Podman or a Kubernetes node agent.  

---

## 4  Environment Setup  

### 4.1 Install System Packages  

```bash
sudo apt update
sudo apt install -y curl git gnupg lsb-release
```

### 4.2 Install Docker Engine & Compose plugin  

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER   # log out/in afterwards
# Compose v2 plugin is included; verify:
docker compose version
```

### 4.3 Optional: Install Kubernetes (K3s single-node)  

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get node
```

---

## 5  Environment Variables  

Copy the template and review values:  

```bash
cp infra/.env.sample infra/.env
nano infra/.env
```

Key variables (excerpt):

```
# Application
NODE_ENV=production
JWT_SECRET=change-me-now

# Database
POSTGRES_USER=roadapp
POSTGRES_PASSWORD=roadapp_pw
POSTGRES_DB=roadapp

# MinIO
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=minio_pw

# Domain / SSL
PUBLIC_URL=https://roads.example.com
```

These are loaded automatically by Docker Compose or K8s ConfigMaps.  

---

## 6  Deployment with Docker Compose  

### 6.1 Build & Pull Images  

From repo root:

```bash
docker compose -f infra/docker-compose.yml pull   # pull prebuilt images
# ‑- or build locally:
docker compose -f infra/docker-compose.yml build
```

### 6.2 Start Stack  

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

Containers started:

* `nginx` – HTTPS reverse proxy (ports 80/443)  
* `frontend` – static SPA  
* `api-gateway` – NestJS API (port 4000 internal)  
* `alignment-engine`, `junction-engine`, … – micro-services  
* **Infrastructure**: `postgres` (w/ PostGIS), `redis`, `minio`, `keycloak`  

### 6.3 Initialisation  

1. **Database migrations**  
   ```bash
   docker compose exec api-gateway yarn migration:run
   docker compose exec api-gateway yarn seed
   ```  
2. **Keycloak realm import** (`infra/keycloak/realm-export.json`):  
   - Browse `https://<DOMAIN>/auth` → Admin console (admin/admin) → Import.  

3. **Create admin user** via application signup or Keycloak.  

### 6.4 Verify  

```bash
curl -I https://<DOMAIN>/api/health
# HTTP/1.1 200 OK
```

Open browser → `https://<DOMAIN>` – log in, create project, import sample DEM (`samples/dem_utm33.tif`).  

### 6.5 Logs & Management  

```bash
docker compose ps
docker compose logs -f api-gateway
docker compose exec minio mc admin info local
```

Stop stack: `docker compose down -v` (removes volumes).  

---

## 7  Deployment with Kubernetes  

### 7.1 Prerequisites  

* Cluster with Ingress controller (NGINX or Traefik)  
* Cert-manager for Let’s Encrypt TLS (optional)  
* Helm v3  

### 7.2 Secrets & ConfigMaps  

```bash
kubectl create ns roadapp
kubectl -n roadapp create secret generic roadapp-env \
  --from-env-file=infra/.env
```

MinIO, Postgres, and Redis can be installed via Helm charts or use managed services (AWS RDS, S3, Elasticache).  

### 7.3 Deploy Base Manifests (Kustomize)  

```bash
cd infra/k8s
kubectl apply -k overlays/staging   # or prod
```

The overlay sets replicas, resources, ingress host, TLS annotations.  

### 7.4 Rollouts & Updates  

Images are tagged by commit SHA. Update overlay image tags and apply:  

```bash
kustomize edit set image roadapp/api=<REGISTRY>/api:sha-abc123
kubectl apply -k overlays/staging
kubectl rollout status deploy/api-gateway -n roadapp
```

### 7.5 Horizontal Scaling  

```bash
kubectl autoscale deploy api-gateway -n roadapp --cpu-percent=60 --min=2 --max=6
```

GPU flow-sim pod:

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
nodeSelector:
  gpu: "true"
```

---

## 8  Persistent Storage  

| Data                    | Location (Docker)                | Volume Mount (K8s)      |
|-------------------------|----------------------------------|-------------------------|
| Postgres                | `pgdata` volume                  | `pvc-postgres` (RWX)    |
| MinIO buckets           | `minio-data` volume              | `pvc-minio` (RWX)       |
| Keycloak realm config   | `keycloak-data`                  | `pvc-keycloak`          |
| Log files (optional)    | `./logs` bind-mount              | Loki/ELK stack          |

Back up Postgres via `pg_dumpall`, MinIO via `mc mirror`.  

---

## 9  Reverse Proxy & SSL  

* **Docker Compose**: NGINX container auto-configures from `infra/nginx/conf.d/*.template`.  
  SSL via Let’s Encrypt + `docker-letsencrypt-nginx-proxy-companion` or cert files mounted to `/etc/nginx/certs`.  

* **Kubernetes**: Ingress object with TLS secret created by cert-manager:  

```yaml
ingressClassName: nginx
tls:
- hosts:
  - roads.example.com
  secretName: roads-tls
```

---

## 10  Health-checks & Monitoring  

| Service          | Endpoint                   | Expected |
|------------------|----------------------------|----------|
| API Gateway      | `/api/health`              | 200 JSON |
| Alignment Engine | `/healthz`                 | `ok`     |
| Frontend         | `/`                        | 200 HTML |
| MinIO            | `/minio/health/live`       | 200      |

Prometheus/Grafana stack manifests in `infra/k8s/monitoring/`.  

---

## 11  Troubleshooting  

| Symptom                           | Check |
|----------------------------------|-------|
| **502 Bad Gateway**               | `docker logs nginx`, verify service container up |
| **Database connection refused**   | Env vars, `pg_hba.conf`, port 5432 exposed |
| **MinIO access denied**           | Correct `MINIO_ROOT_USER/PASSWORD`, bucket policy |
| **Keycloak not reachable**        | Check `keycloak` pod env `DB_VENDOR=postgres` |
| **Flow-sim job stuck**            | GPU present? `docker info | grep -i nvidia` |

Logs: `docker compose logs <svc>` or `kubectl logs -n roadapp <pod>`  

---

## 12  Removal / Clean-up  

*Docker Compose*:  
```bash
docker compose down -v --remove-orphans
docker volume rm pgdata minio-data keycloak-data
```

*Kubernetes*:  
```bash
kubectl delete ns roadapp
kubectl delete pvc -l app=roadapp
```

---

## 13  Next Steps & Production Hardening  

1. **Scale database** – use managed Postgres 15 with backups.  
2. **Object storage** – point MinIO client to S3/Blob storage for redundancy.  
3. **CI/CD** – Argo CD or Flux for Git-ops; build in GitHub Actions.  
4. **WAF & IDS** – place Cloudflare or AWS WAF in front of Ingress.  
5. **Backups** – schedule pg_dump + MinIO bucket replication nightly.  

---

### Enjoy building smarter roads with **RoadDesignApp**!  
If you hit issues, open an issue in the repository or join the community Slack.
