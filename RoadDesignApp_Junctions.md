# RoadDesignApp – Junction & Intersection Design Module  
Version 1.0 • Last updated 2025-06-17  

---

## 1. Scope & Goals  
This module enables designers to create, edit, and validate both simple and complex roadway junctions within RoadDesignApp. It parallels the functionality offered by professional tools such as SierraSoft Junctions and MathWorks RoadRunner while remaining 100 % web-native.

### Primary Objectives  
1. Support geometric creation of T-, Y-, Cross (+), roundabout, multi-leg, and grade-separated interchanges.  
2. Maintain AASHTO (and selectable regional) geometric standards for lane taper lengths, curve radii, sight-distance, and conflict-point minimization.  
3. Seamlessly blend new junction geometry with existing horizontal/vertical alignments and corridor models.  
4. Output validated 3-D BIM entities (IFC Alignment, IFC RoadIntersection) and 2-D plans suitable for CAD exchange (LandXML, DWG).  

---

## 2. High-Level Workflow  

| # | Phase | UI Pane | Behind-the-Scenes Service |
|---|-------|---------|---------------------------|
| 1 | Select Alignment(s) | Map Pane | Alignment service loads centerlines & metadata |
| 2 | Pick Junction Template | Side-Bar «Junctions» library | Fetch JSON template, pre-populate param form |
| 3 | Input Control Values <br> (design speed, radii overrides, lane count, island size) | Property Drawer | Real-time validation via `junction-engine` |
| 4 | Place & Preview | Map Pane overlays ghost geometry | WebSocket stream of geometry vertices |
| 5 | Optimize (auto-compute radii, tapers, superelev.) | «Optimize» button | Heuristic solver (Go) + AASHTO rule set |
| 6 | Generate 3-D Model | 3-D Viewport | WASM sweep of multi-branch cross-sections |
| 7 | Conflict & Sight-Distance Check | Overlay heat-map | `traffic-analysis` service (Python) |
| 8 | Commit to Project | Save action | Persist entities (PostGIS + MinIO) |

Undo/Redo operate at every step via the global command stack.

---

## 3. Supported Intersection Types  

| Category | Sub-types / Notes |
|----------|------------------|
| At-grade Simple | T-intersection, Y-intersection, Cross (+) |
| At-grade Complex | 5-leg, 6-leg, multi-lane roundabout (1–3 lanes), signalised or unsignalised |
| Grade-separated | Diamond, Cloverleaf (full & partial), Trumpet, Stack (2- & 3-level) |
| Auxiliary Features | Channelized islands, slip lanes, acceleration/deceleration lanes, median U-turns |

Templates are stored as JSON parametric definitions:

```json
{
  "id": "roundabout-2lane",
  "name": "Roundabout – 2-Lane",
  "params": {
    "inscribed_diameter": { "min": 40, "max": 60, "default": 50 },
    "entry_radius": { "min": 25, "max": 35, "default": 30 },
    "circulatory_width": { "value": "2 * lane_width + 1.0" }
  },
  "rules": ["AASHTO.Roundabout.2023"]
}
```

---

## 4. Data Model Extensions  

### 4.1 Relational  
```
junction(id PK, project_id FK, name, type, json_params, created_at)
junction_leg(id PK, junction_id FK, alignment_id FK, leg_index)
junction_surface(id PK, junction_id FK, mesh_key, triangulation_level)
```

### 4.2 Object Storage (MinIO)  
* `junctions/{project}/{junctionId}/plan.geojson`  
* `junctions/{project}/{junctionId}/model.gltf`  

---

## 5. Computational Engines  

### 5.1 `junction-engine` (Go)  
* Inputs: selected alignments, template JSON, user param set  
* Outputs:  
  * Horizontal geometry (compound curves, tapers)  
  * Vertical profile blends (vertical curves, grade breaks)  
  * Superelevation transition tables  
  * Validation report (`RuleViolation[]`)  

Algorithms employ clothoid concatenation, offset centre calculations, and minimum-path curvature checks. gRPC endpoint: `GenerateJunction(GenerateJunctionRequest) returns (JunctionGeometry)`.

### 5.2 `junction-model` (Rust → WASM/native)  
* Sweeps lane-specific cross-sections along multi-branch spine splines, merges with corridor meshes, produces glTF or IFC solids.  
* Handles splitter islands, truck-apron volumes, and mountable curb profiles.  

---

## 6. UI / UX Specification  

### 6.1 Side-Bar «Junctions» Tab  
```
Templates ▾     Custom ▾
• T-Intersection
• Roundabout 1-Lane
• Roundabout 2-Lane
• Diamond Interchange
...
```
Drag template onto map → property drawer opens with param sliders + live compliance flags.

### 6.2 Geometry Gizmos  
* Leg handles (rotate, offset)  
* Radius grab-circles with snap-to-min values  
* Drag drop-curves to adjust deflection angles  

### 6.3 Validation Indicators  
* Green tick ✅ = fully compliant  
* Amber ⚠️ = advisory (e.g., desirability criteria)  
* Red ❌ = violation (must fix before commit)  
Mouse-over lists rule IDs & recommended range.

---

## 7. Technical Implementation Details  

| Concern | Approach |
|---------|----------|
| Real-time feedback | WebSocket topic `/ws/junction/{tempId}` streams incremental geometry for sub-100 ms latency |
| Collision detection | Sweep line algorithm on leg centerlines; highlight overlapping pavements |
| Vertical blending | Cubic Bézier for ramp tapers; K-value solver ties into existing vertical engine |
| Sight-distance | Python `traffic-analysis` utilises R-Tree visibility sampling over 3-D mesh |
| Signalisation | JSON schema for signal phases; exported as `OpenDrive` or `SUMO` intersection nodes |
| Undo/Redo | Command pattern `CreateJunctionCmd`, `MoveLegCmd`, `EditParamCmd` |
| Permissions | Only `role:designer` may modify; `role:reviewer` can comment via annotations API |

---

## 8. API Contract (excerpt – NestJS)  

```ts
// POST /junction
interface CreateJunctionDto {
  projectId: string;
  templateId: string;
  alignments: string[];  // IDs
  params: Record<string, number|string>;
}
@Roles('designer')
@Post('junction')
create(@Body() dto: CreateJunctionDto) { /* … */ }

// GET /junction/:id/model
@Get('junction/:id/model')
@Header('Content-Type','model/gltf-binary')
downloadModel(@Param('id') id:string) { /* stream from MinIO */ }
```

---

## 9. Validation Rule Library (sample)  

| Rule ID | Description | Source |
|---------|-------------|--------|
| AASHTO.Horiz.MinRadius | Leg entry curve radius ≥ min per design speed | AASHTO GB §3.2 |
| AASHTO.Taper.Length    | Accel/Decel taper length per Eqn 3-24         | AASHTO GB §10 |
| ISO.RAB.Vis.01         | Minimum 50 m splitter island visibility       | ISO 21542 |
| Local.Signals.DualRing | Dual-ring signals for 5-leg ≥ 40 km/h flows   | State DOT spec |

Rules are YAML-defined and loaded into the `junction-engine` at startup.

---

## 10. Future Enhancements  
* Parametric interchange ramp grading wizard with earthwork cost optimisation.  
* Micro-simulation coupling (Vissim) via FMI exporter.  
* Auto-generated pedestrian crossing geometry & ADA compliance checks.  

---

**End of Document**