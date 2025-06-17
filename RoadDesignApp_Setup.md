# RoadDesignApp – Project Setup Guide
Version 1.0 • Last updated 2025-06-17

This document walks you through preparing a local **development environment** for the RoadDesignApp and getting the full micro-service stack running on Linux (Ubuntu 22.04) or macOS.  
Production deployment to a Linux server/Kubernetes is described separately.

---

## 1. Prerequisites

| Tool | Minimum Version | Purpose |
|------|-----------------|---------|
| Git  | 2.40            | Source control |
| Node.js (via `nvm`) | 20 LTS | React front-end, NestJS API |
| Yarn | 3.x (berry)     | JS monorepo package manager |
| Go   | 1.22            | Alignment engine |
| Rust | stable (via `rustup`) | 3D corridor service (WASM & native) |
| Python | 3.11 + `venv` | Terrain service, cost estimator |
| GDAL | 3.8 + Python bindings | Raster/LiDAR handling |
| Docker | 24.x          | Container runtime |
| Docker Compose | v2 plugin | Local stack orchestration |
| PostgreSQL | 15 + PostGIS 3.4 | Spatial database (inside Docker) |
| Redis | 7             | Job queue (inside Docker) |
| MinIO | current       | Object storage (inside Docker) |

### 1.1 Quick install snippets

```bash
# Linux
curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts

sudo apt update && sudo apt install -y build-essential python3.11 python3.11-venv gdal-bin libgdal-dev
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER  # log out/in

# macOS (brew)
brew install nvm go rust python@3.11 gdal docker docker-compose
```

---

## 2. Clone & Bootstrap Repository

```bash
git clone https://github.com/<your-org>/road-design-app.git
cd road-design-app
```

### 2.1 Directory Scaffold (auto-generated on first run)

```
.
├── frontend/           # React + Three.js
├── services/
│   ├── api-gateway/    # NestJS
│   ├── alignment-engine/  # Go
│   ├── model-service/     # Rust
│   ├── terrain-service/   # Python
│   └── cost-estimator/    # Python
├── infra/
│   ├── docker-compose.yml
│   └── k8s/
└── .env.sample
```

If a folder is missing run:

```bash
yarn dlx @roadapp/cli new-service alignment-engine --lang go
```

---

## 3. Environment Variables

Copy the template and adjust ports/credentials if needed:

```bash
cp .env.sample .env
```

`.env.sample` excerpt:

```
NODE_ENV=development
POSTGRES_USER=roaddev
POSTGRES_PASSWORD=roaddev
POSTGRES_DB=roadapp
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=minio123
JWT_SECRET=change-me
```

All services load these vars via `dotenv`, `cobra` or `pydantic-settings`.

---

## 4. Installing Dependencies

### 4.1 JavaScript workspaces

```bash
cd frontend
yarn install
cd ../../services/api-gateway
yarn install
```

### 4.2 Go modules

```bash
cd services/alignment-engine
go mod tidy
```

### 4.3 Rust crates

```bash
cd services/model-service
rustup target add wasm32-unknown-unknown
cargo build --release
```

### 4.4 Python virtual environments

```bash
cd services/terrain-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# repeat for cost-estimator
```

---

## 5. Running the Full Stack Locally

### 5.1 Start backend services with Docker Compose

```bash
cd infra
docker compose up -d postgres redis minio
```

### 5.2 Launch micro-services in watch mode (separate shells / tmux panes)

```bash
# API Gateway
cd services/api-gateway
yarn start:dev            # http://localhost:4000

# Alignment Engine
cd services/alignment-engine
go run ./cmd/server

# Terrain Service
cd services/terrain-service
source .venv/bin/activate
python main.py

# Model Service (native)
cd services/model-service
cargo run

# Cost Estimator
cd services/cost-estimator
source .venv/bin/activate
python app.py
```

### 5.3 Start the React front-end

```bash
cd frontend
yarn dev                  # http://localhost:3000
```

Open `http://localhost:3000` in your browser—login screen should appear.

> Tip: use `docker compose logs -f` to watch Postgres/GDAL output when importing terrain.

---

## 6. Database Migrations & Seed Data

```bash
# From repo root
yarn workspace api-gateway migration:run
yarn workspace api-gateway seed
```

This creates initial roles (admin/designer/viewer).

---

## 7. Verifying Your Setup

1. Create a project in the UI.  
2. Upload a small DEM (`samples/dem_utm33.tif`).  
3. Draw a tangent–curve–spiral alignment; save.  
4. Inspect the 3D view—corridor mesh should render.  
5. Click “Estimate Cost”; CSV download triggers.

If any step fails, check:

```
docker compose ps
docker compose logs <service>
```

---

## 8. Recommended VS Code Extensions

* **ESLint** – lint JS/TS workspace  
* **Go** – modules, debugging  
* **rust-analyzer** – Rust IDE features  
* **Python** – Pylance, Jupyter  
* **Docker** – container management  
* **GraphQL** – schema & queries  
* **MapLibre GL JS Snippets** – helpers for map layers  
* **Thunder Client** – REST client for API testing  

---

## 9. Cleaning Up

```bash
docker compose down -v       # stop & remove volumes
git clean -fdx               # remove build artifacts
```

---

## 10. Next Steps

* Explore the [Architecture document](docs/RoadDesignApp_Architecture.md).  
* Read the [Implementation Plan](docs/RoadDesignApp_Implementation.md) for sprint guidance.  
* Create feature branches: `git checkout -b feature/superelevation-wizard`.

Happy designing!
