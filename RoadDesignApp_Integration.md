# RoadDesignApp – Integration Plan  
File: `RoadDesignApp_Integration.md`  
Version 1.0 • Last updated 2025-06-17  

---

## 1  Purpose  
This document explains how the **core RoadDesignApp** (corridor/alignment/3-D engine) integrates with the four new advanced modules:  

1. Junction & Intersection Design  
2. Traffic Signage & Marking Design  
3. Drainage System Design  
4. Terrain Leveling & Grading  

It covers architecture, data-flow, shared services, and a phased implementation timeline.

---

## 2  Extended System Architecture  

```
                       ┌────────────────────────┐
                       │        Browser         │
                       │  React + Three.js SPA  │
                       └─────────┬──────────────┘   WebSocket / REST
                                 │
┌───────────── Client-side Shared Libraries ─────────────┐
│  • dxf-wasm · ifcjs · deck.gl overlays · worker-pool   │
└─────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  API Gateway (NestJS)  │
                    └─┬────────┬─────────┬───┘
          gRPC / REST│        │REST     │REST
                     │        │         │
        ┌────────────▼──┐ ┌───▼─────────▼───┐
        │Alignment Core│ │Shared Services   │
        │  (Go)        │ │• Auth (Keycloak) │
        └─┬────────────┘ │• File Store      │
          │ gRPC         │  (MinIO/S3)      │
          │              │• Job Queue       │
          │              │  (Redis/BullMQ)  │
          ▼              └──────┬───────────┘
┌─────────────────┐  ┌──────────▼───────────┐
│3-D Model Svc    │  │ Terrain Svc (GDAL)   │
│(Rust/WASM)      │  └──────────┬───────────┘
└─────────────────┘             │
        ▲                       │
        │                       │
────────┼───────── Advanced Modules (micro-services) ─────────
        │                       │
        │  gRPC                 │ gRPC
        ▼                       ▼
┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Junction-Eng │  │ Signage-Engine   │  │ Drainage Suite  │  │ Grading Engine  │
│  (Go)        │  │  (Go)            │  │  (Py + Rust)    │  │  (C++/Go)       │
└──────────────┘  └──────────────────┘  └─────────────────┘  └─────────────────┘
```

Legend:  
• Solid lines = synchronous gRPC/REST.  
• Dashed boxes = existing components.  
• Bold boxes = new modules.

---

## 3  Data-Flow Overview  

| # | Event / Action | Data Source | Consumers | Stored Artifacts |
|---|----------------|-------------|-----------|------------------|
| 1 | User edits alignment | Front-end ↔ Alignment Core | Junction-Eng, 3-D Model, Drainage, Signage | `alignment.json` (PostGIS) |
| 2 | “Create Junction” | Front-end → Junction-Eng | 3-D Model, Signage | `junction.geojson`, `junction.gltf` |
| 3 | “Auto Sign Corridor” | Signage-Eng | Front-end, Exporters | `sign_instance`, `mark_instance` tables |
| 4 | “Run Drainage Calc” | Drainage Suite | Grading Engine, Cost Estimator | `drain_link`, `flow_sim rasters` |
| 5 | “Optimise Grading” | Grading Engine | 3-D Model, Cost Estimator, Drainage | `design_surface.tif`, `masshaul.csv` |
| 6 | Export Project (IFC, OpenDRIVE, LandXML) | Exporter Pipeline | — | ZIP in MinIO |

Concurrency managed via **Job Queue**; each long process enqueues a job id and streams progress over WebSocket (`/ws/job/{id}`).

---

## 4  Shared Components & Contracts  

| Component | Responsibility | Modules Using It |
|-----------|----------------|------------------|
| **Auth (Keycloak)** | SSO, role-based policy | all |
| **PostGIS** | Geometry storage, topology queries | Core, Junction, Signage, Drainage, Grading |
| **MinIO** | Large file/object store (glTF, GeoTIFF) | all |
| **Job Queue (Redis + BullMQ)** | Async tasks, retries | Junction, Drainage, Grading, Flow Sim |
| **Rule Library (`*.yaml`)** | Design & compliance rules | Junction, Signage, Drainage, Grading |
| **Exporter Pipeline** | IFC, OpenDRIVE, DWG, CSV | Core + all modules |
| **Notification Service** | WebSocket push, email digest | all |

Common *protobuf* schema (`common.proto`) defines: `Alignment`, `Surface`, `RuleViolation`, `JobStatus`.

---

## 5  Interface Specifications (excerpt)  

### 5.1  gRPC – Junction Engine  

```
service JunctionService {
  rpc Generate (GenerateJunctionRequest) returns (JunctionGeometry);
  rpc Validate (JunctionId) returns (RuleReport);
}
```

### 5.2  REST – Drainage  

```
POST /drain/network/auto-size    👈 body: {stormId, networkId}
GET  /drain/hgl/{networkId}
```

### 5.3  WebSocket Topics  

```
/ws/alignment/{id}
/ws/job/{jobId}
/ws/drain/{networkId}/flow
```

---

## 6  Database Extensions  

```
-- shared keys
project_id UUID references project(id)

table junction               (id uuid pk, project_id, type, json_params, surf_mesh_key)
table sign_instance          (id uuid pk, project_id, code, pos_geom, bearing, props jsonb)
table mark_instance          (id uuid pk, project_id, path_geom, style jsonb)
table drain_node / drain_link (…)
table design_surface         (id uuid pk, project_id, raster_key, tin_key)
```

Spatial indices (`GIST`) on `pos_geom` and `path_geom` enable fast map queries.

---

## 7  Security & Permissions  

| Role | Capabilities (new) |
|------|--------------------|
| **Designer** | Create/modify junction, signage, drainage, grading jobs |
| **Reviewer** | Run validations, comment, approve |
| **Viewer** | Read-only, download exports |

JWT scopes: `junction:write`, `signage:write`, `drain:run`, `grading:run`.

---

## 8  Implementation Timeline  

| Sprint | Duration | Deliverables | Dependencies |
|--------|----------|--------------|--------------|
| **9** | 2 wks | Junction Engine MVP, UI palette, DB tables | Alignment Core ready |
| **10** | 2 wks | Signage Engine + asset catalog, placement UI | Junction IDs, 3-D renderer instancing |
| **11** | 3 wks | Drainage Suite (hydrology, network sizing), Map overlays | Terrain Svc tiling |
| **12** | 3 wks | Terrain Grading Engine, mass-haul chart, cost hook | Drainage outputs |
| **13** | 1 wk | Unified exporter update (IFC OpenDRIVE) | All geometry types stable |
| **14** | 1 wk | End-to-end integration test, performance tuning | — |
| **15** | 1 wk | Documentation, training videos, beta release | — |

Continuous CI/CD updates each sprint; staging URL refreshed nightly.

---

## 9  Testing & Quality Assurance  

1. **Contract Tests**: protobuf/REST schemas validated in CI.  
2. **Integration E2E**: Playwright script designs road → creates junction → auto-sign → drainage → grading → export; asserts no rule violations.  
3. **Performance Benchmarks**:  
   • ≤500 ms Junction generation for 4-leg cross.  
   • ≤5 s Drainage HGL calc for 5 km project.  
4. **Security**: OWASP ZAP scan on API gateway each release.  

---

## 10  Risk & Mitigation  

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Heavy GPU flow-sim fails on some browsers | Medium | Server-side fallback, progress bar with abort |
| Asset LOD swaps cause popping | Low | Fade-cross-fade shader, prefetch textures |
| Rule sets vary by region | Medium | Configurable rule profiles, project-level override |
| Large grading surfaces (>10 M pts) overload WASM | High | Auto-switch to native micro-service, chunk streaming |

---

## 11  Next Steps  

* Finalise common protobuf schema v0.9.  
* Set up dedicated **drainage-gpu** node pool (optional GPU).  
* Draft UX mock-ups for junction/marking wizards.  
* Author region-specific rule sets (EU, AUS).  

---

**End of RoadDesignApp Integration Plan**
