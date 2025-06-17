# RoadDesignApp – Drainage System Design Module  
Version 1.0 • Last updated 2025-06-17  

---

## 1  Purpose & Scope  
The Drainage module equips RoadDesignApp with end-to-end capabilities for the planning, analysis, and documentation of roadway drainage infrastructure in accordance with international standards (AASHTO HDS-5, EN 1997-1, Austroads AGRD05).  

Primary objectives:  
1. Perform hydrologic & hydraulic calculations for catchments intersecting the road corridor.  
2. Design and position drainage elements—culverts, inlets, manholes, channels, pipes—ensuring capacity, cover, and maintenance access meet standards.  
3. Simulate surface runoff and subsurface flow across existing/graded terrain, visualising ponding, flow paths and velocity vectors.  
4. Produce construction drawings, quantity schedules, and BIM exports (IFC4x3 `IfcPipeSegment`, `IfcCulvert`).  
5. Integrate seamlessly with road alignment, 3-D corridor, and cost estimator services.  

---

## 2  Standards & References  

| Standard | Application |
|----------|-------------|
| AASHTO HDS-5 (2020) | Culvert & storm drain design equations |
| AASHTO HEC-22 (2014) | Inlet spacing, gutter flow, spread |
| EN 1997-1 / EN 1991-2 | European hydraulic structures & load combinations |
| Austroads AGRD05-20 | Open/kerb & channel design criteria |
| FHWA HY-8 v7.7 | Culvert rating curves (reference implementation) |
| ISO 4354 | Rainfall intensity data handling |

Rule files (`drain_rules.yaml`) encapsulate numeric limits per region.

---

## 3  High-Level Workflow  

| # | Phase | UI Pane | Engine/Service |
|---|-------|---------|----------------|
| 1 | Define Catchments | Map Pane (draw polygons) | `hydrology-service` computes area, CN, Tc |
| 2 | Rainfall Setup | Hydrology Wizard | NOAA/IDF API fetch or manual IDF CSV |
| 3 | Generate Runoff | Hydrology Report | SCS CN / Rational Method results |
| 4 | Place Drainage Network | Side-bar “Drainage” palette | Snap to gutter lines, centerline, profiles |
| 5 | Hydraulic Sizing | Property drawer → “Auto-Size” | `hydraulics-engine` iterates Manning, energy grade |
| 6 | Flow Simulation | 3-D Viewport overlay | `flow-sim` service runs 2-D shallow-water (GPU) |
| 7 | Validate | Compliance panel | Rule checks (freeboard, velocity limits) |
| 8 | Export & Cost | Export menu / Cost tab | IFC, LandXML Drainage, quantities to estimator |

Undo/Redo supported at each step via global command stack.

---

## 4  Key Functional Capabilities  

### 4.1 Hydrologic Analysis  
* **Catchment delineation**: Automatic watershed via D8 algorithm on DEM or manual polygon.  
* **Time of concentration (Tc)**: Kirpich, NRCS, or user-defined.  
* **Rainfall intensity**: IDF curves (return period selection; depth-duration-frequency).  
* **Runoff computation**:  
  * Small catchments (<80 ha): Rational Method \(Q=C i A\).  
  * Larger/urban: NRCS CN (Type I–III storms).  
* **Hydrograph generation**: Unit hydrograph convolution, adjustable temporal resolution.

### 4.2 Hydraulic Design  
* **Storm drains**: Circular, elliptical, or box pipes; material DB (PVC, HDPE, RCP).  
* **Inlets**: Grate, curb-opening, combination per HEC-22 tables; spacing optimisation for allowable gutter spread.  
* **Culverts**: Single/multi-cell; inlet/outlet control analysis (AASHTO nomographs equations).  
* **Channels & ditches**: Trapezoidal, V, rectangular; Manning’s n library.  
* **Energy grade line (EGL) & hydraulic grade line (HGL)** profiles with surcharge flags.  
* **Outfalls & energy dissipation**: Rip-rap basin sizing (HEC-14).  

### 4.3 Flow Simulation  
* 2-D depth-averaged shallow water solver (GPU WebGPU / WebAssembly) for floodplain limits.  
* Generates raster maps of max depth, velocity, shear stress; exported as GeoTIFF.  
* Supports unsteady hydrographs & culvert structures via internal boundary conditions.

### 4.4 Terrain Grading Integration  
* Auto-cut benches for ditches respecting max slope & safety clear zone.  
* Balances cut/fill with corridor to minimise export material.  
* Updated terrain mesh fed back to corridor 3-D model & cost estimator.

---

## 5  Data Model Extensions  

```
catchment(id PK, project_id FK, area_m2, tc_min, cn, rainfall_id, json_geom)
rainfall_idf(id PK, project_id FK, region, return_period, idf_csv_key)
drain_node(id PK, project_id FK, type {inlet,manhole,outfall}, xyz, invert_elev, rim_elev, structure_ref)
drain_link(id PK, project_id FK, from_node FK, to_node FK, shape, diameter, length, slope, material, design_flow, capacity_flow)
culvert(id PK, project_id FK, alignment_id FK, station, shape, cell_count, span, rise, skew, inlet_ctrl)
flow_sim(id PK, project_id FK, event_name, raster_depth_key, raster_vel_key, max_depth_m)
```

---

## 6  Computational Services  

| Service | Language | Responsibilities |
|---------|----------|------------------|
| `hydrology-service` | Python (NumPy/Pandas) | Runoff, hydrograph, IDF interpolation |
| `hydraulics-engine` | Go | Pipe network solver (HGL), culvert rating, inlet spread |
| `flow-sim` | Rust + WebGPU | 2-D shallow water GPU solver, returns tiled NetCDF/GeoTIFF |
| `gradings-engine` | C++ → WASM | Auto-ditch grading, slope optimisation |

All expose gRPC / REST endpoints; long simulations post status via WebSocket progress channels.

---

## 7  User Interface Specification  

### 7.1 Side-bar “Drainage” Tab  
* **Hydrology** sub-panel – list of catchments, rainfall sets, design storms (add/edit).  
* **Network** sub-panel – palette (inlet, manhole, pipe, culvert, channel).  
* **Profiles** – HGL/EGL chart viewer with critical nodes flagged.  

### 7.2 Map & 3-D View  
* Nodes visualised as icons; links colour-coded by flow capacity (green < 80 %, amber 80-100 %, red > 100 %).  
* Flow vectors & depth heat-map layer toggle (GPU textures).  
* Right-click node → “Show Contributing Catchment”, “Invert Elev”.  

### 7.3 Property Drawer (when element selected)  
* Geometry: invert/rim, length, slope (auto-computed from vertices).  
* Design: discharge, Manning’s n, freeboard req.  
* Buttons: **Auto-Size**, **Run Check**, **View Curve** (culvert rating).  

### 7.4 Validation Panel  
* Live rule compliance list: undersized pipe, excessive spread, inadequate cover, velocity out-of-range, scour risk.  
* Severity icons (Info, Warning, Error).  
* Clicking item zooms to offending link/node.  

---

## 8  API Endpoints (NestJS)  

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/hydro/catchment` | create/edit catchment polygon |
| GET | `/hydro/:id/report` | runoff & hydrograph JSON/CSV |
| POST | `/drain/network/auto-size` | size full network for storm event |
| GET | `/drain/hgl/:networkId` | HGL profile polyline |
| POST | `/flow-sim/run` | enqueue 2-D simulation |
| GET | `/flow-sim/:simId/status` | progress & download raster keys |

All heavy tasks return `jobId`; WebSocket channel `/ws/job/{jobId}` streams progress.

---

## 9  Validation Rule Library (excerpt)  

| Rule ‑ ID | Description | Standard |
|-----------|-------------|----------|
| `Pipe.FullFlow.VelMin` | Full-flow velocity ≥ 0.6 m/s to avoid sediment | AASHTO HEC-22 4-5 |
| `Pipe.FullFlow.VelMax` | Velocity ≤ 6 m/s (RCP) or 3 m/s (PVC) | Material specs |
| `Inlet.GutterSpread` | Max gutter spread ≤ 0.9 m travel lane | HEC-22 5-3 |
| `Culvert.Freeboard` | HW/D ≤ 1.5 for 50-yr event | AASHTO HDS-5 |
| `Outlet.Energy` | Need dissipator if V > 3 m/s | HEC-14 |

Rules stored in YAML; user selects regional rule-set at project creation.

---

## 10  Cost Estimation Integration  
Quantities returned per storm drain link (length·diameter), culvert concrete volume, rip-rap tonnage, excavation & bedding. The `cost-estimator` maps `category=drainage` for cost breakdown.

---

## 11  Performance & Scalability  
* GPU-accelerated flow sim solves 2-D mesh (100 k cells) < 3 s on RTX 3060; server-side fallback with OpenMP CPU.  
* Pipe network solver handles 10 k links in < 200 ms.  
* DEM preprocessing tiles cached as COG (cloud-optimised GeoTIFF) enabling incremental watershed calc.

---

## 12  Roadmap  

| Version | Feature |
|---------|---------|
| v1.0 | Core hydrology/hydraulics, GPU flow sim, validation rules |
| v1.1 | Subsurface drainage (under-drains), French drain library |
| v2.0 | Green infrastructure (bioswales, permeable pavements) |
| v2.1 | Real-time rainfall API & alerting for maintenance ops |

---

**End of Document**
