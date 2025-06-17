# MANIFEST.md  
RoadDesignApp – Package Structure Manifest  
Version 1.0 • Generated 2025-06-17  

This manifest describes every top-level directory and primary component contained in the RoadDesignApp source package. It is intended to help new developers, DevOps engineers, and reviewers quickly understand how the codebase is organised and where to locate specific functionality.

---

## 1. Repository Layout

```
road-design-app/
├── frontend/                    # React + Three.js single-page application
├── services/                    # All backend micro-services
│   ├── api-gateway/             # NestJS API & WebSocket hub
│   ├── alignment-engine/        # Go service: horizontal/vertical alignment maths
│   ├── model-service/           # Rust/WASM: 3-D corridor & mesh generation
│   ├── terrain-service/         # Python GDAL: DEM ingest, surface queries
│   ├── cost-estimator/          # Python FastAPI: quantities & cost reports
│   ├── junction-engine/         # Go: junction/intersection geometry solver
│   ├── signage-engine/          # Go: traffic sign & marking rule engine
│   ├── drainage-suite/          # Python/Rust: hydrology & hydraulics
│   └── grading-engine/          # C++/Go: cut/fill optimisation & grading
├── infra/                       # Deployment & DevOps assets
│   ├── docker-compose.yml       # One-click local stack
│   ├── .env.sample              # Environment variable template
│   ├── nginx/                   # Reverse proxy configs & TLS certs
│   └── k8s/                     # Kubernetes manifests (base + overlays)
├── docs/                        # Architecture, module specs, API docs
├── samples/                     # Sample DEMs / alignments for testing
├── logs/                        # Bind-mounted runtime log folders
├── reports/                     # Generated cost & analysis reports
├── setup.sh                     # Helper script to scaffold env & certs
├── DEPLOYMENT.md                # Server deployment guide
├── RoadDesignApp_*.md           # Detailed module design docs
└── README.md                    # Project high-level overview
```

---

## 2. Component Purpose Summary

| Path | Component | Purpose |
|------|-----------|---------|
| `frontend/` | Web UI | Offers map, 3-D viewport, editors, wizards; built with React, TypeScript, MapLibre GL & Three.js. |
| `services/api-gateway/` | API Gateway | Central entrypoint (REST + GraphQL) that routes requests to micro-services, handles auth & aggregation. |
| `services/alignment-engine/` | Alignment Engine | Implements AASHTO formulas for tangents, curves, spirals, vertical profiles; exposes gRPC. |
| `services/model-service/` | 3-D Model Service | Generates glTF corridor meshes by sweeping cross-section templates along 3-D alignment; returns lightweight previews via WASM. |
| `services/terrain-service/` | Terrain Service | Imports DEM/LiDAR, builds TINs, serves elevation queries & slope rasters. |
| `services/cost-estimator/` | Cost Estimator | Calculates quantities, applies regional unit rates, outputs CSV/XLS/PDF reports. |
| `services/junction-engine/` | Junction Engine | Creates parametric T/Y/X, roundabouts, interchanges; validates against standards. |
| `services/signage-engine/` | Signage Engine | Rule-based placement & validation of traffic signs, road markings; manages asset library. |
| `services/drainage-suite/` | Drainage Suite | Hydrologic runoff, storm-drain sizing, 2-D flow simulation; returns HGL/EGL profiles & rasters. |
| `services/grading-engine/` | Grading Engine | Optimises earthworks, generates design surfaces, mass-haul diagrams. |
| `infra/docker-compose.yml` | Compose Stack | Spins up full stack (DB, Redis, MinIO, Keycloak, Nginx, SPA & all services) on a single host. |
| `infra/nginx/` | Reverse Proxy | SSL termination, routing to SPA, API, WebSockets, Keycloak, MinIO. |
| `infra/k8s/` | K8s Manifests | Kustomize base & overlays for staging/production clusters. |
| `docs/` | Documentation | Architecture diagrams, module specs, API references, validation rule sets. |
| `samples/` | Test Data | Example terrain file (`dem_utm33.tif`) and placeholder LandXML alignments. |
| `setup.sh` | Init Script | Creates folder tree, self-signed certs, default configs for local dev. |

---

## 3. Key Runtime Infrastructure

| Service | Image (default tag) | Exposed Port | Data Volume |
|---------|--------------------|--------------|-------------|
| PostgreSQL/PostGIS | `postgis/postgis:15-3.3` | 5432 | `pgdata` |
| Redis | `redis:7-alpine` | 6379 | `redis-data` |
| MinIO | `minio/minio:latest` | 9000/9001 | `minio-data` |
| Keycloak | `quay.io/keycloak/keycloak:21.1` | 8080 | `keycloak-data` |
| NGINX | `nginx:1.25-alpine` | 80/443 | — |

---

## 4. Coding Conventions

* **Monorepo** with language-specific sub-projects.  
* **Docker-first philosophy**: each service has its own Dockerfile and can run standalone.  
* **gRPC + Protobuf** for internal contracts, **REST/GraphQL** at API Gateway.  
* **TypeScript** linters (`eslint`, `prettier`) and **Go** linters (`golangci-lint`) enforced in CI.  
* Unit tests in each service; Playwright for end-to-end UI tests.

---

## 5. Contribution Workflow

1. Fork → create feature branch (`feature/xyz`).  
2. Run `setup.sh` then `docker compose up -d` to verify local stack.  
3. Add/modify service code; ensure `yarn test` / `go test` / `pytest` pass.  
4. Update docs inside `docs/` if public API changes.  
5. Open Pull Request – GitHub Actions will lint, test, build images.  
6. Review → squash & merge → staging deploy via CI.

---

## 6. Further Reading

* `docs/RoadDesignApp_Architecture.md` – macro architecture diagrams.  
* `DEPLOYMENT.md` – step-by-step server deployment guide.  
* `docs/*_Module.md` – detailed specs for Junction, Drainage, Signage, Grading modules.  

---

*End of MANIFEST*  
