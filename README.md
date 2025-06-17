# RoadDesignApp

A full-stack, **web-based road design platform** that brings CAD-grade functionality—horizontal/vertical alignment, 3-D corridor modelling, junctions, signage, drainage and grading—directly to your browser.  
The stack is containerised for easy Linux deployment and follows international standards such as **AASHTO**, **MUTCD**, ISO/EN drainage rules, and more.

---

## Table of Contents
1. [Key Features](#key-features)  
2. [Architecture Overview](#architecture-overview)  
3. [Quick Start (Docker Compose)](#quick-start-docker-compose)  
4. [Installation Details](#installation-details)  
5. [Basic Usage](#basic-usage)  
6. [Module Highlights](#module-highlights)  
7. [Project Structure](#project-structure)  
8. [Roadmap](#roadmap)  
9. [Support & Contributing](#support--contributing)  
10. [Further Reading](#further-reading)  

---

## Key Features

| Domain                | Highlights |
|-----------------------|------------|
| **Alignment Design**  | Tangents, circular & compound curves, clothoids, vertical grades + parabolas with AASHTO compliance checker |
| **3-D Modelling**     | Real-time WebGL preview & high-res glTF exports of corridor solids, cut/fill shading |
| **Junctions**         | T/Y/X, roundabouts, interchanges; parametric templates with automatic validation |
| **Signage & Marking** | Drag-and-drop MUTCD / Vienna signs, lane lines, arrows; rule-based auto-populate |
| **Drainage**          | Catchment delineation, pipe/culvert sizing, 2-D flow simulation, HGL/EGL profiles |
| **Terrain Grading**   | Cut/fill optimisation, mass-haul diagrams, bench & slope wizards |
| **Cost Estimation**   | Quantity take-off, regional unit-rate library, PDF/XLS reports |
| **Interoperability**  | Export to LandXML, IFC 4x3, OpenDRIVE, DWG/DXF |
| **DevOps Friendly**   | Docker Compose & K8s manifests, health checks, Prometheus metrics, Keycloak SSO |

---

## Architecture Overview

```
Browser (React + Three.js)
        │  REST / WebSocket
API Gateway (NestJS)
        │  gRPC / REST
┌───────────────────────────────────────────────────────────┐
│  Alignment │ 3-D Model │ Terrain │ Cost │ Junction │ ... │
│   (Go)     │ (Rust)    │ (Py)    │ (Py) │  (Go)    │     │
└───────────────────────────────────────────────────────────┘
PostgreSQL/PostGIS • MinIO • Redis • Keycloak • NGINX
```

*Detailed diagrams are in* `docs/RoadDesignApp_DiagramsAndVisuals.md`.

---

## Quick Start (Docker Compose)

```bash
# 1. Clone & enter repo
git clone https://github.com/<org>/road-design-app.git
cd road-design-app

# 2. One-time setup: creates folders, self-signed certs, .env
./setup.sh

# 3. Launch stack
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# 4. Open your browser
https://localhost          # default self-signed HTTPS
```

First-time users should run database migrations and seed data:

```bash
docker compose exec api-gateway yarn migration:run
docker compose exec api-gateway yarn seed
```

*(See [DEPLOYMENT.md](DEPLOYMENT.md) for production & K8s instructions.)*

---

## Installation Details

| Requirement | Version |
|-------------|---------|
| Docker      | 24.x or newer |
| Docker Compose plugin | v2 |
| OS          | Ubuntu 22.04 LTS / Rocky 9 / Debian 12 (other Linux fine) |
| Optional GPU| NVIDIA driver + `nvidia-container-toolkit` for drainage flow-sim |

> **Windows/Mac users** can run via WSL 2 or Docker Desktop.

---

## Basic Usage

1. **Login / Sign-up** – default Keycloak admin: `admin / admin` (change in production).  
2. **Create Project** – pick region & rule-set.  
3. **Import Terrain** – drag GeoTIFF/LAS into *Surfaces → Import*.  
4. **Design Alignment** – use tangent/curve/spiral tools; watch live AASHTO status light.  
5. **Generate 3-D Model** – *Corridor → Generate* shows shaded solids.  
6. **Add Junctions & Signs** – drag templates or auto-populate via wizards.  
7. **Design Drainage** – define catchments, auto-size pipes, run flow sim.  
8. **Optimise Grading** – run cut/fill solver, review mass-haul.  
9. **Estimate Cost** – one click to generate XLS/PDF.  
10. **Export** – choose LandXML, IFC, OpenDRIVE, or DWG from *Export* menu.

---

## Module Highlights

### Junction & Intersection
* Templates: T, Y, 4-leg, roundabout (1-3 lanes), diamond interchange  
* Rule-check: min radii, taper lengths, sight distance  

### Signage & Marking
* Libraries: MUTCD, Vienna, UK TSRGD, AU AS1742  
* Auto-sign wizard uses YAML rule engine (`signage-engine` service)  

### Drainage
* Hydrology: Rational / NRCS CN  
* Hydraulics: HEC-22 inlet spacing, HDS-5 culvert equations  
* GPU 2-D flow sim outputs depth/velocity GeoTIFF  

### Terrain Grading
* Simulated-annealing optimiser, bench & slope wizard  
* Mass-haul CSV + interactive chart  

---

## Project Structure

```
frontend/         React/Three.js SPA
services/
  api-gateway/    NestJS REST/GraphQL
  alignment-engine/  Go math service
  model-service/  Rust + WASM mesh gen
  ...             (junction, drainage, grading etc.)
infra/
  docker-compose.yml   One-click stack
  nginx/               Reverse proxy & TLS
  k8s/                 Kustomize manifests
docs/             Architecture & specs
samples/          DEM & alignment examples
```

A full directory manifest is in `MANIFEST.md`.

---

## Roadmap

| Version | Planned Items |
|---------|---------------|
| v1.1    | Pavement layer designer, IFC BIM improvements |
| v2.0    | Traffic micro-simulation, real-time collaboration |
| v2.1    | AR field viewer, machine-control export (Trimble) |

---

## Support & Contributing

* **Issues / Bugs** – open on GitHub  
* **Feature requests** – start a discussion or draft PR  
* **Community chat** – Slack invite: [link]  

### Local Dev

```bash
# Start DB & infra only
docker compose up -d postgres redis minio keycloak

# Run services in watch mode
cd services/api-gateway && yarn start:dev
```

Coding conventions: ESLint + Prettier (TS), GolangCI-Lint (Go), black/flake8 (Python).

---

## Further Reading

* Architecture: `docs/RoadDesignApp_Architecture.md`  
* Module Specs: `docs/RoadDesignApp_Junctions.md`, `..._Signage.md`, `..._Drainage.md`, `..._TerrainGrading.md`  
* Deployment: `DEPLOYMENT.md`  
* API Reference (Swagger): `https://<domain>/api` after stack up  

---

© 2025 RoadDesignApp – MIT License  
