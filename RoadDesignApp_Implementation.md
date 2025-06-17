# RoadDesignApp_Implementation.md  
Implementation Plan – RoadDesignApp  
Version 1.0

---

## 1. Milestone Timeline

| Sprint | Duration | Features |
|--------|----------|----------|
| 0 | 1 wk | Repo bootstrap, CI/CD pipeline, Docker scaffolding |
| 1 | 2 wks | Auth, project CRUD, PostGIS schema |
| 2 | 2 wks | MapLibre base-map, layer manager, view layout |
| 3 | 3 wks | Horizontal alignment editor (straights, circular curve, clothoid) |
| 4 | 2 wks | Vertical profile editor, grade/parabola engine |
| 5 | 3 wks | 3D corridor generator (prototype) & viewport |
| 6 | 2 wks | Terrain import & sampling |
| 7 | 1 wk | Cost estimator MVP |
| 8 | 2 wks | File export (LandXML, glTF) & polish, QA |

Continuous integration runs lint, tests, Docker build, pushes to registry; CD deploys to staging Kubernetes.

---

## 2. Repository Layout

```
road-design-app/
├── frontend/        # React + Three.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapPane.tsx
│   │   │   ├── AlignmentTable.tsx
│   │   │   └── ThreeViewport.tsx
│   │   ├── hooks/
│   │   ├── services/  # REST clients
│   │   └── styles/
├── services/
│   ├── api-gateway/      # NestJS
│   ├── alignment-engine/ # Go
│   ├── model-service/    # Rust + WASM
│   ├── terrain-service/  # Python GDAL
│   └── cost-estimator/   # Python
├── infra/           # Docker-compose, k8s manifests
└── docs/
```

---

## 3. Front-End Interface (React + MapLibre + Three.js)

### 3.1 Layout Skeleton (Chakra UI)

```tsx
// AppLayout.tsx
export const AppLayout = () => (
  <Grid templateColumns="360px 1fr" templateRows="60px 1fr">
    <TopBar gridColumn="1/3" />
    <SideBar />
    <Workspace />   {/* contains MapPane + ThreeViewport in tabs */}
  </Grid>
);
```

### 3.2 Map Pane with Alignment Overlay

```tsx
// MapPane.tsx
import maplibregl from 'maplibre-gl';
import { useEffect } from 'react';
export const MapPane = ({ alignmentGeoJSON }) => {
  const mapRef = useRef<maplibregl.Map>();

  useEffect(() => {
    mapRef.current = new maplibregl.Map({
      container: 'map',
      style: 'https://demotiles.maplibre.org/style.json',
      center: [ -122.45, 37.78 ],
      zoom: 13
    });
    return () => mapRef.current?.remove();
  }, []);

  useEffect(() => {
    if (!mapRef.current || !alignmentGeoJSON) return;
    if (mapRef.current.getSource('alignment')) {
      (mapRef.current.getSource('alignment') as maplibregl.GeoJSONSource).setData(alignmentGeoJSON);
    } else {
      mapRef.current.addSource('alignment', { type: 'geojson', data: alignmentGeoJSON });
      mapRef.current.addLayer({ id:'alignment-l', type:'line', source:'alignment',
        paint:{ 'line-color':'#ea4335', 'line-width':4 }});
    }
  }, [alignmentGeoJSON]);
  return <Box id="map" h="100%"/>;
};
```

### 3.3 Three.js 3D Viewport

```tsx
// ThreeViewport.tsx
const ThreeViewport = ({ corridorMesh }) => {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = new Scene();
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(mount.current!.clientWidth, mount.current!.clientHeight);
    mount.current!.appendChild(renderer.domElement);

    const camera = new PerspectiveCamera(60, mount.current!.clientWidth / mount.current!.clientHeight, 0.1, 10000);
    camera.position.set(0, -200, 80);

    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new AmbientLight(0xffffff, 0.8));

    if (corridorMesh) scene.add(corridorMesh);

    const animate = () => { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();
    return () => { renderer.dispose(); };
  }, [corridorMesh]);

  return <Box ref={mount} w="100%" h="100%" />;
};
```

---

## 4. Alignment Algorithms (AASHTO)

Service: `alignment-engine` (Go, exposes gRPC).

### 4.1 Horizontal Elements

```go
// spiral.go (Clothoid)
func SpiralLength(vDesign float64, curveRadius float64) float64 {
	// AASHTO Eqn 3-38: Ls = (V^3) / (C * R)
	const C = 46.5 // metric constant for comfort (kph, m)
	return math.Pow(vDesign, 3) / (C * curveRadius)
}

// Computes X,Y coordinates along spiral using Fresnel integrals
func SpiralXY(Ls, s float64) (x, y float64) {
	t := s / Ls
	c, s := math.Cos(math.Pi*t*t/2), math.Sin(math.Pi*t*t/2)
	x = Ls * c
	y = Ls * s
	return
}
```

### 4.2 Vertical Parabolic Curve

```go
type PVI struct{ Station, Elev, GradeIn, GradeOut float64 }

func ParabolaElev(pvi PVI, station float64) (elev float64) {
	L := (pvi.GradeOut - pvi.GradeIn) * 100.0 / pvi.GradeIn  // length derived or given
	x := station - pvi.Station
	k := L / (pvi.GradeOut - pvi.GradeIn)
	elev = pvi.Elev + pvi.GradeIn*x + (x*x)/(2*k)
	return
}
```

### 4.3 Superelevation Check

```go
func MinRadius(vDesign, eMax, fMax float64) float64 {
	// AASHTO Eqn 3-13: R = V² / (g*(e+f))
	v := vDesign / 3.6 // km/h to m/s
	return v * v / (9.81 * (eMax + fMax))
}
```

Alignment JSON Response:

```json
{
  "id": "align-01",
  "designSpeed": 80,
  "horiz": [
    { "type":"tangent","length":100 },
    { "type":"spiral","length":60 },
    { "type":"curve","radius":400,"delta":30 },
    { "type":"spiral","length":60 }
  ],
  "vertical": [
    { "station":0,"elev":123.4,"gradeIn":0.02,"gradeOut":-0.01 }
  ]
}
```

---

## 5. 3D Corridor Generation (Rust + WASM)

Algorithm: sweep typical cross-section along 3D poly-line.

```rust
// corridor.rs (simplified)
pub fn build_corridor(center: &[Point3<f64>], template: &[OffsetHeight]) -> Mesh {
    let mut vertices = Vec::new();
    for (i, p) in center.iter().enumerate() {
        let dir = if i+1 < center.len() { center[i+1]-p } else { p-center[i-1] };
        let normal = Vector3::new(-dir.y, dir.x, 0.0).normalize();
        for tx in template {
            let offset = normal * tx.offset + Vector3::new(0.0, 0.0, tx.height);
            vertices.push(p + offset);
        }
    }
    triangulate(vertices)
}
```

Expose to JS:

```rust
#[wasm_bindgen]
pub fn corridor_gltf(center_js: JsValue, templ_js: JsValue) -> Vec<u8> {
  let center: Vec<Point3<f64>> = serde_wasm_bindgen::from_value(center_js).unwrap();
  let templ: Vec<OffsetHeight> = serde_wasm_bindgen::from_value(templ_js).unwrap();
  let mesh = build_corridor(&center, &templ);
  mesh.to_gltf()
}
```

Front-end call:

```ts
import init, { corridor_gltf } from 'model_service';
const gltfBytes = corridor_gltf(centerLine, template);
const blob = new Blob([gltfBytes], { type:'model/gltf-binary' });
```

---

## 6. Terrain Sampling

Python + GDAL:

```python
def sample_profile(dem_path: str, alignment: list[tuple[float,float]], srs: str='EPSG:4326'):
    import rasterio, pyproj
    trans = pyproj.Transformer.from_crs('EPSG:4326', srs, always_xy=True)
    coords = [trans.transform(*pt) for pt in alignment]
    with rasterio.open(dem_path) as src:
        elevations = [val[0] for val in src.sample(coords)]
    return elevations
```

---

## 7. Cost Estimation Pipeline

1. `model-service` returns earthwork volumes per station.
2. `cost-estimator` multiplies by unit rates.

```python
vol_df = pd.read_parquet('volumes.parq')
rates = db.fetch_rates(region)
result = vol_df.merge(rates, on='item_code')
result['cost'] = result.volume * result.unit_rate
```

Expose `/cost/{projectId}` → CSV/XLS.

---

## 8. API Gateway Contracts (NestJS)

```ts
@Post('alignment')
create(@Body() dto: AlignmentDto) { return this.alignSvc.create(dto); }

@Get('alignment/:id/corridor')
async corridor(@Param('id') id: string) {
   const center = await this.alignSvc.points(id);
   return this.modelSvc.generateCorridor(center);
}
```

Swagger auto-generated docs at `/api`.

---

## 9. Testing Strategy

* Unit: Go test for alignment math, Jest for React components.
* Integration: Supertest hitting NestJS + in-memory DB.
* E2E: Playwright – record user designing a curve & validating 3D view.
* Performance: Bench in Go (`go test -bench`), WebGL FPS monitor.

---

## 10. Deployment Commands

```bash
# Docker-Compose
docker compose -f infra/dev-compose.yml up -d

# K8s
kubectl apply -f infra/k8s/postgres.yml
helm upgrade --install roadapp ./infra/chart
```

---

## 11. Future Enhancements

* Sight-distance analysis module
* Real-time collaboration via CRDT
* Pavement layer designer and material library
* Mobile field AR viewer using same glTF models

---
**End of Implementation Plan**
