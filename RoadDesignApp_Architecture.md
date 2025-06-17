# RoadDesignApp Architecture

## 1. Purpose & Scope
RoadDesignApp is a browser-based road design platform that delivers CAD-grade functionality—horizontal/vertical alignment, 3D corridor modelling, terrain handling, and cost estimation—while being hosted on a Linux server.  The goal is to provide an experience comparable to SierraSoft Roads Design, but entirely web-native.

---

## 2. High-Level Architecture

```
+-----------------------------+       +---------------------------+
|           Browser           | <---> |  Web Gateway / API Node  |
|  (Angular/React + WebGL)    |       |  (NestJS/Express)         |
+-----------------------------+       +---------------------------+
                                               |
                                               v
+---------------------------+     +------------------+     +--------------------+
|   Alignment Engine (Go)   | <-> | 3D Model Service | <-> |  Terrain Service   |
|   (AASHTO rules)          |     |  (C++/Rust WASM) |     |  (GDAL, DEM store) |
+---------------------------+     +------------------+     +--------------------+
          |                                   |                       |
          v                                   v                       v
+---------------------------+     +------------------+     +--------------------+
|  Cost Estimator Service   |     |   Job Queue      |     |   Data Warehouse   |
|  (Python)                 |     |   (Redis/RQ)     |     |  (PostgreSQL/PostGIS) |
+---------------------------+     +------------------+     +--------------------+

               ^  (AuthN/AuthZ via Keycloak)  |
               |                              v
         +---------------------------------------------+
         |            Object Storage (MinIO/S3)        |
         +---------------------------------------------+
```

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Front-end | React + TypeScript, Three.js/WebGL, Chakra UI | Rich, componentized SPA; Three.js for 3D viewport |
| Mapping | MapLibre GL JS + OpenStreetMap tiles | Self-host or public CDN for background maps |
| Server/API | Node.js (NestJS) | Structured, typed API, easy realtime (WebSockets) |
| Computational Engines | Go (alignment), C++/Rust compiled to WASM (3D generation) | Performance-critical math inside WASM, concurrency in Go |
| Data | PostgreSQL + PostGIS | Geometric queries, terrain rasters |
| Raster/DEM Handling | GDAL, PDAL | Proven geospatial tooling |
| Messaging & Jobs | Redis + BullMQ/RQ | Offload heavy tasks |
| AuthN/AuthZ | Keycloak (OIDC) | Enterprise-ready SSO |
| Storage | MinIO (S3 compatible) | Stores large terrain, model, export files |
| Containerization | Docker, Docker-Compose / Kubernetes | Portable Linux deployment |
| CI/CD | GitHub Actions → server via SSH / Argo CD | Automate tests & deploys |

---

## 4. Core Components

### 4.1 Front-End SPA
* Multi-pane layout: Map/3D viewport, alignment table, cross-section editor.
* WebGL renderer overlays road centerline, cross-sections, corridor solids.
* WebSockets for live progress bars (terrain import, corridor build).
* Import wizard (CSV, LandXML, IFC, GeoTIFF).

### 4.2 Web Gateway/API
* REST + GraphQL endpoints
* Validates input (e.g., design speed 30-130 km/h).
* Streams large file uploads to MinIO.

### 4.3 Alignment Engine
* Libraries implementing AASHTO Green Book formulas:
  * Horizontal: simple/compound curves, clothoid spirals, superelevation envelopes.
  * Vertical: grade elements, K-value parabola computation.
* Exposes gRPC interface; returns alignment geometry JSON + station equations.

### 4.4 3D Model Service
* Consumes alignment + terrain mesh, generates corridor solids (TIN) and IFC4 alignment entities.
* Light-weight C++ core compiled to WASM for client-side preview; heavier batch mode runs native on server for high-resolution export.

### 4.5 Terrain Service
* Ingest: DEM (GeoTIFF/ASCII), LiDAR (LAS/LAZ) → raster & TIN.
* Resampling and tiling for WebGL consumption.
* Intersection queries for profile extraction.

### 4.6 Cost Estimator
* Python micro-service with pandas.
* Bill-of-Quantities templates (earthwork, pavement layers, signage, drainage).
* Consumes volumes from 3D Model Service; outputs CSV/XLS and PDF summary.

---

## 5. Key Feature Implementation

| Feature | Approach |
|---------|----------|
| Horizontal alignment editor | Interactive gizmos on MapLibre canvas; undo/redo command pattern; AASHTO checks triggered on change |
| Vertical profile | SVG-based chart, draggable PVI; live K-value compliance indicator |
| Superelevation & cross-slopes | Parametric tables derived from design speed; rendered as color bands in cross-section viewer |
| Terrain import | Chunk upload → GDAL translate/reproject → store in PostGIS raster + cloud-optimized GeoTIFF for tiles |
| 3D corridor | Sweep typical cross-section along 3D centerline via WASM; encode as glTF for viewport |
| Cost estimation | Database of unit costs by region; matrix multiplication of quantities × rates; scenario comparison |
| Export | LandXML, IFC4x3, DWG (via ODA), glTF; packaged in ZIP |

---

## 6. Data Model Highlights

### 6.1 Relational (PostgreSQL/PostGIS)

```
project(id PK, name, region, currency, created_by, created_at)
alignment(id PK, project_id FK, name, design_speed, start_station, json_geometry)
profile(id PK, alignment_id FK, vertical_json)
cross_section_template(id PK, project_id FK, json_definition)
terrain(id PK, project_id FK, type {DEM,LAS}, srs, minio_key)
cost_item(id PK, project_id FK, code, description, unit, unit_price)
quantity(id PK, alignment_id FK, cost_item_id FK, station_from, station_to, volume)
```

### 6.2 Object Storage (MinIO)
* `terrain/{project}/{uuid}.tif`
* `models/{project}/{alignment}.gltf`
* `exports/{project}/{bundle}.zip`

---

## 7. Integration & Extensibility
* CAD Interop: LandXML / IFC4x3 for BIM, optional DWG via ODA File Converter.
* GIS: WMS/WMTS layers can be added as map overlays.
* Plugin System: Front-end exposes event bus; back-end offers webhooks for automation.

---

## 8. Security, Performance, Scalability
* OAuth2/OIDC with role-based policies (viewer, designer, admin).
* HTTPS everywhere, signed URLs for MinIO.
* Horizontal scale via Kubernetes pods (stateless API).
* CPU-bound engines can leverage auto-scaling node pools with GPU (for large meshes).
* Caching: PostGIS raster tiles, Redis result cache for alignment computations.

---

## 9. Deployment Plan (Linux)

1. **Infrastructure**
   * Ubuntu 22.04 LTS VM(s) or Kubernetes cluster.
   * Reverse proxy: Nginx with LetsEncrypt.
2. **Containers**
   * `frontend` (Node nginx alpine serving React build)
   * `api` (NestJS)
   * `alignment-engine` (Go)
   * `model-service` (C++ or Rust)
   * `terrain-service` (Python GDAL)
   * `cost-estimator` (Python)
   * `postgres`, `redis`, `minio`, optional `keycloak`
3. **CI/CD**
   * GitHub Actions: lint → unit tests → Docker build → push to registry
   * Staging deploy via SSH/Kubectl; promote to prod after e2e test suite.
4. **Monitoring**
   * Prometheus + Grafana dashboards (CPU per engine, query times).
   * Loki for log aggregation; Alertmanager on error rate.

---

## 10. Roadmap & Future Work
| Phase | Add-on |
|-------|--------|
| v1    | Core alignment, 3D, cost, OSM maps |
| v1.1  | Superelevation wizard, IFC export |
| v2    | Traffic simulation, sight-distance analysis |
| v3    | Full drainage design, environmental impact, mobile field app |

---

## 11. References
* AASHTO Green Book 8th Edition
* ISO 16739-1: IFC4x3
* SierraSoft Roads Design UI patterns (public demos)

---
**End of Document**
