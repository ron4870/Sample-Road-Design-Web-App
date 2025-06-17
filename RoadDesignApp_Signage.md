# RoadDesignApp – Traffic Signage & Marking Design Module  
Version 1.0 • Last updated 2025-06-17  

---

## 1  Purpose & Scope  
The Signage & Marking module equips RoadDesignApp with capabilities equivalent to MathWorks RoadRunner for creating, validating, and exporting all roadside furniture, line markings and surface text required for modern roadway projects.

Primary aims:  
1. Provide standards-based sign libraries (MUTCD, Vienna Convention, regional sets).  
2. Offer interactive marking tools for lanes, arrows, symbols, cross-walks, hatching, rumble strips.  
3. Enforce rule-based placement tied to underlying alignment geometry, speed, lane config and junction types.  
4. Render signs/markings in true-scale 3-D with PBR materials and LOD switching.  
5. Export to BIM (IFC4x3 `IfcRoadFurniture`, `IfcRoadMark`), simulation (OpenDRIVE 1.7, SUMO, CARLA) and 2-D CAD (DWG / DXF).  

---

## 2  High-Level Workflow  

| # | Phase | UI Pane | Engine/Service |
|---|-------|---------|----------------|
| 1 | Select Library | Side-bar “Signs” or “Markings” | `catalog-service` returns SVG + glTF assets |
| 2 | Place Element | Map or 3-D viewport drag-&-drop | Live snapping to edge-of-pavement / lane centre |
| 3 | Auto-Populate | “Auto-sign Corridor” wizard | `signage-engine` runs rules, suggests batch set |
| 4 | Validate | Compliance overlay | `signage-engine` returns `RuleViolation[]` |
| 5 | Render | 3-D view & MapLibre canvas | `asset-service` streams LOD glTF |
| 6 | Export | Top-bar ▶ Export | Converter pipeline writes IFC / OpenDRIVE |

Undo/Redo via global command stack; multi-select editing supported.

---

## 3  Asset Libraries  

### 3.1  Sign Catalog  
* **Core libraries** (stored in MinIO):  
  * MUTCD (US) – 600+ signs  
  * Vienna Convention set – 400+ signs  
  * ISO/UK TSRGD, AASHTO Guide Signs, Australia AS 1742  
* Each sign record (`sign_asset.json`) contains:  
  ```json
  {
    "code": "R1-1",
    "name": "STOP",
    "class": "regulatory",
    "shape": "octagon",
    "size": { "width":0.75, "height":0.75 },
    "retroreflectivity": "RA2",
    "textures": { "front":"signs/R1-1/front.png", "back":"common/alum.png" },
    "lod": {
      "high":"signs/R1-1/high.gltf",
      "med":"signs/R1-1/med.gltf",
      "low":"signs/R1-1/low.gltf"
    }
  }
  ```

### 3.2  Marking Catalog  
* Line types: solid, dashed (variable pattern), double, triple.  
* Symbols: arrows (ahead, left, right, merge), bike logo, bus logo, EV charger.  
* Area markings: chevrons, hatching, cross-walk zebra, stop bar.  
* Surface text: “STOP”, “SLOW”, speed numerals.  
* Parameters: colour (RGB & RAL), width, gap length, retroreflectivity, material roughness.  

---

## 4  Rule-Based Placement Engine (`signage-engine`)  

### 4.1  Concept  
YAML-defined rule sets reference roadway attributes and decide what to place where.  
```yaml
- id: MUTCD_StopControl
  if:
    junction.type in ["T","Cross"] and traffic_control == "stop"
  then:
    place:
      sign: "R1-1"
      at: "approach"
      distance_before_stop_line: 2.0   # m
      lateral_offset: 0.6              # m
```

### 4.2  Supported Triggers  
* Alignment geometry (PI, PC/PT, station)  
* Junction metadata (type, control)  
* Speed limit zone boundaries  
* Lane config changes (lane_drop, split, merge)  
* Pedestrian facilities presence  

### 4.3  Output  
`PlacementProposal[]` → UI list with accept/reject per item; accepted proposals converted into persistent `sign_instance` / `mark_instance` records.

---

## 5  Data Model Extensions  

```
sign_instance(id PK, project_id FK, code, pos_geom GEOGRAPHY(PointZ), bearing, height, face_count, post_type, json_props)
mark_instance(id PK, project_id FK, type, subtype, path_geom GEOGRAPHY(LineStringZ|PolygonZ), width, color, json_props)
```

Spatial indices enable map filtering and collision checks.

---

## 6  3-D Visualization  

* **Rendering**: Three.js with PBR materials; SSAO & shadow map for realism.  
* **LOD**: Switch at 150 m (med), 400 m (low).  
* **Billboarding**: Distant signs optionally billboard for performance.  
* **Animated markings**: Optional flashing beacons via emissive maps + time uniform.  

---

## 7  User Interface Specification  

### 7.1  Side-bar “Signs” Tab  
* Search box (code / keyword)  
* Tree: Regulatory ▶ Warning ▶ Guide ▶ Custom  
* Drag-drop or click-to-place. While dragging:  
  * Snap indicators (edge/full offset)  
  * Dynamic conflict highlight (overlap with other furniture).  

### 7.2  Side-bar “Markings” Tab  
* Palette of line types and symbols.  
* Properties drawer (width, colour, pattern length/gap).  
* Polyline drawing gizmo; Ctrl-click toggles straight/arc.  
* “Follow Alignment” tool: auto tracks centreline with offset.  

### 7.3  Auto-Populate Wizard  
* Checklist of rule sets to apply.  
* Parameter overrides (sign height, offset, units).  
* Preview table with accept/skip toggles.  

### 7.4  Validation Panel  
* Live list of issues grouped by severity.  
* Click row → zoom to offending sign/mark.  

---

## 8  APIs  

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/signs/catalog?lib=MUTCD&search=STOP` | return matching sign assets |
| `POST` | `/signs` | create new sign instance |
| `PATCH` | `/signs/{id}` | update pose/props |
| `GET` | `/marks/catalog?type=line` | list marking templates |
| `POST` | `/marks` | create marking geometry |
| `POST` | `/signage/auto` | run rule engine & return proposals |
| `GET` | `/export/opendrive` | download OpenDRIVE with signs/marks |

All asset downloads streamed via signed MinIO URLs.

---

## 9  Implementation Details  

| Component | Tech | Notes |
|-----------|------|-------|
| `catalog-service` | NestJS + PostgreSQL | serves asset metadata, caches glTF URLs |
| `signage-engine` | Go | rule evaluation, snapping, compliance |
| `marking-editor` | React hooks + MapLibre vector layers | real-time editing, undo stack |
| 3-D renderer | Three.js + instanced meshes | GPU-instanced signs for >5 k assets |
| Collision/visibility | WebWorker using RBush R-Tree | checks 30 fps during drag |
| Exporters | Python | IFC, OpenDrive, SUMO, DWG via ODA CLI |

---

## 10  Validation Rule Library (excerpt)  

| Rule | Description | Standard |
|------|-------------|----------|
| `MUTCD.Table2B-1.Spacing` | Speed-based minimum spacing between warning signs | MUTCD 2009 |
| `LineWidth.Min` | Marking line width ≥ 100 mm rural, 150 mm freeway | ISO paint spec |
| `CrossWalk.StopBar` | Stop bar 1 m before cross-walk | FHWA Ped Guide |
| `SignOffset.ClearZone` | Lateral offset ≥ 1.8 m from edge for V≤70 km/h | AASHTO RDG |

Rules stored as YAML and hot-reloaded.

---

## 11  Performance & Scalability  

* Instanced rendering keeps frame-time < 16 ms for 10 k signs on mid-tier GPU.  
* WebSocket diff stream reduces bandwidth for collaborative editing.  
* CDN edge cache for static sign textures.  
* Pre-baked texture atlases for markings lowers draw calls by 60 %.  

---

## 12  Roadmap  

| Release | Feature |
|---------|---------|
| v1.0 | Manual placement, rule engine, IFC/OpenDRIVE export |
| v1.1 | Dynamic message signs, variable speed limit zones |
| v2.0 | LiDAR-based retroreflectivity audit, AR field verification app |

---

**End of Document**
