# RoadDesignApp – UI Mock-up  
High-level wireframe and interaction flow for the browser-based road-design application.

---

## 1. Top-level Layout (Desktop, 1920 × 1080)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  A. Top Bar (60 px)                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
│ B. Side Bar (320 px) │ C. Workspace (flex)                                 │
│                      │ ┌─────────────┬───────────────────────────────────┐ │
│                      │ │ C1. Map     │ C2. 3-D View / Cross-Section tab │ │
│                      │ │  Pane       │                                   │ │
│                      │ └─────────────┴───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
│ D. Status Bar (24 px)                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Element annotations

| Ref | Name | Purpose | Key Interactions |
|-----|------|---------|------------------|
| A   | Top Bar | Brand logo, project selector, undo/redo, save, export, user avatar. | • Global cmds (Ctrl+S, Ctrl+Z/Y).<br>• Export dropdown (LandXML, IFC, glTF, PDF). |
| B   | Side Bar | Accordion with *Project Tree*, *Alignment Tools*, *Vertical Tools*, *Cost* tabs. | • Drag tools into Map.<br>• Right-click context menu on tree nodes (rename, duplicate). |
| C1  | Map Pane (MapLibre) | 2-D plan view with OSM tiles + alignment overlay. | • Click-drag tangents.<br>• Gizmo handles for PI & curve radius.<br>• Scroll = zoom, Shift-drag = pan. |
| C2  | 3-D / Cross-Section Tabs | Split view; default is 3-D WebGL viewer, second tab shows dynamic cross-section at cursor station. | • Orbit controls, section slider.<br>• Toggle layers (terrain, corridor, sub-grade). |
| D   | Status Bar | Real-time station/elevation read-out, CPU tasks queue, connectivity light. | • Click task name to open job log panel. |

---

## 2. Side Bar Detail

### 2.1 Project Tree Tab  
```
Project ▾
├─ Alignments
│  ├─ CL-01 ▸
│  └─ CL-02
├─ Surfaces
│  ├─ Existing Terrain
│  └─ Design Surface
└─ Templates
   └─ Rural-2Lane
```
* Double-click item = activate editor.  
* Drag “Template” over alignment = assign corridor template.

### 2.2 Alignment Tools Tab  
Icon grid (16 px):  
| Icon | Tool | Shortcut | Behaviour |
|------|------|----------|-----------|
| ↔︎ | Tangent | T | Click-drag to draw straight |
| ⟳ | Circular curve | C | Select two tangents → dialog for radius |
| ∿ | Spiral | S | Auto-generated or manual length |
| ↧ | Reverse | R | Creates reverse compound curve |
Buttons anchored bottom: **Check AASHTO** (opens compliance panel), **Generate Corridor**.

### 2.3 Vertical Tools Tab  
* Profile chart shown; draggable PVIs.  
* Table editor with Station, Grade-In, Grade-Out, K-value result column.  
* Superelevation Wizard button (opens modal with design-speed presets).

### 2.4 Cost Tab  
* BOQ table: Description | Qty | Unit | Rate | Amount.  
* “Regenerate Quantities” button triggers cost-estimator micro-service → progress bar appears in Status Bar.

---

## 3. Interaction Flow – Designing an Alignment

1. User selects **CL-01** in Project Tree → Map Pane centers & highlights.
2. Press **T** and click two points => new tangent appears in red.  
   • Side Bar now shows numeric fields: *Azimuth*, *Length*.  
3. Press **C** (Circular) → click tangent-to-tangent intersection.  
   • Radius prompt defaults to min per design speed (calc by engine).  
4. Press **Enter** → curve & automatic pair of spirals created.  
   • AASHTO indicator in Top Bar turns green if compliant, red with tooltip if not.
5. Open **Vertical Tools** → drag PVI; chart updates in real-time; Map Pane dotted projection updated.
6. Click **Generate Corridor** → 3-D tab activates; WASM build runs; progress 0–100 % bottom bar.
7. 3-D model appears; user pans, inspects cut/fill shading.  
8. Switch to **Cross-Section** tab; move station slider → dynamic section + volumes.
9. Open **Cost Tab** → click **Regenerate Quantities**; cost table fills; PDF export from Top Bar.

---

## 4. Responsive Behaviour

* ≥1440 px: Side Bar collapsible; C1 and C2 can split vertically.  
* ≤1280 px: Side Bar switches to icon rail; Workspace uses tabbed Map / 3-D.  
* Tablet: Progressive reduction—3-D disabled, only Map + numeric forms.  
* Mobile: Read-only viewer (alignment & cost summary).

---

## 5. Color & Iconography Guide

| Component | Color | Notes |
|-----------|-------|-------|
| Alignment in-progress | #EA4335 (red) | Hovers glow. |
| Validated alignment | #34A853 (green) | Meets standards. |
| Terrain mesh | #8D6E63 (brown) | Semi-transparent. |
| Cut volumes | #FF7043 (orange) | 50 % opacity. |
| Fill volumes | #42A5F5 (blue) | 50 % opacity. |
| Status OK | 🟢 | WebSocket connected. |
| Status Error | 🔴 | Hover for stacktrace. |

Icons sourced from Material Symbols (outlined).

---

## 6. Keyboard Shortcuts Cheat-sheet

| Key | Action |
|-----|--------|
| Ctrl + S | Save project |
| Ctrl + Z / Y | Undo / Redo |
| T | Draw Tangent |
| C | Add Curve |
| S | Insert Spiral |
| V | Open Vertical profile |
| G | Generate corridor |
| F | Toggle full-screen 3-D |

---

## 7. Future UX Enhancements

* Real-time collaboration cursors (CRDT).  
* Contextual help pop-overs on first use.  
* Mini-map overview in bottom-right of Map Pane.  
* AR mode (mobile) – view corridor on real terrain.

---
**End of UI Mock-up**
