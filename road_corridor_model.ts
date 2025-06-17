/**
 * road_corridor_model.ts
 * 
 * 3D road corridor modeling component using Three.js
 * Generates road corridor meshes based on horizontal and vertical alignment data
 * Integrates with terrain models and visualizes cross-sections
 */

import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AlignmentElement, AlignmentElementType, Point2D, Point3D } from './alignment_engine';

// Type definitions
export interface CrossSectionPoint {
  offset: number;  // Horizontal distance from centerline (negative = left, positive = right)
  height: number;  // Vertical distance from profile grade line
  code: string;    // Point code (e.g., 'ETW' = Edge of Travel Way, 'HS' = Hinge/Shoulder)
  layer?: string;  // Optional layer name for material assignment
}

export interface CrossSectionTemplate {
  id: string;
  name: string;
  description?: string;
  points: CrossSectionPoint[];
  lanes?: LaneConfiguration;
  superelevationPivot?: 'centerline' | 'inside' | 'outside';
}

export interface LaneConfiguration {
  laneCount: number;
  laneWidth: number;  // meters
  shoulderWidthLeft: number;
  shoulderWidthRight: number;
  medianWidth?: number;  // For divided highways
}

export interface TerrainModel {
  sampleElevation(x: number, y: number): number;
  getTriangulatedMesh(): THREE.BufferGeometry;
  getBoundingBox(): THREE.Box3;
}

export interface CorridorParameters {
  alignmentElements: AlignmentElement[];
  profilePoints: { station: number, elevation: number, grade: number }[];
  template: CrossSectionTemplate;
  terrain?: TerrainModel;
  stationStart?: number;
  stationEnd?: number;
  sampleInterval?: number;  // Distance between cross-sections in meters
  superelevationData?: SuperelevationData[];
}

export interface SuperelevationData {
  station: number;
  leftSlope: number;  // Decimal (e.g., 0.02 = 2%)
  rightSlope: number; // Decimal (e.g., 0.02 = 2%)
}

export interface CorridorVisualizationOptions {
  showCenterline?: boolean;
  showCrossSections?: boolean;
  crossSectionSpacing?: number;
  highlightStation?: number;
  materialOptions?: {
    pavement?: THREE.Material;
    shoulder?: THREE.Material;
    slope?: THREE.Material;
    centerline?: THREE.Material;
    crossSection?: THREE.Material;
  }
}

/**
 * Main class for 3D road corridor modeling
 */
export class RoadCorridorModel {
  private corridor: THREE.Group;
  private centerline: THREE.Line;
  private pavementMesh: THREE.Mesh;
  private shoulderMesh: THREE.Mesh;
  private slopeMesh: THREE.Mesh;
  private crossSections: THREE.Group;
  private parameters: CorridorParameters;
  private crossSectionData: Map<number, CrossSectionResult>;
  private boundingBox: THREE.Box3;
  
  // Default materials
  private defaultMaterials = {
    pavement: new THREE.MeshStandardMaterial({ 
      color: 0x333333, 
      roughness: 0.7,
      metalness: 0.1
    }),
    shoulder: new THREE.MeshStandardMaterial({ 
      color: 0x555555, 
      roughness: 0.8,
      metalness: 0.0
    }),
    slope: new THREE.MeshStandardMaterial({ 
      color: 0x8B4513, 
      roughness: 0.9,
      metalness: 0.0
    }),
    centerline: new THREE.LineBasicMaterial({ 
      color: 0xFFFF00,
      linewidth: 2
    }),
    crossSection: new THREE.LineBasicMaterial({ 
      color: 0xFF0000,
      linewidth: 1
    })
  };

  constructor() {
    this.corridor = new THREE.Group();
    this.corridor.name = 'RoadCorridor';
    this.crossSections = new THREE.Group();
    this.crossSections.name = 'CrossSections';
    this.crossSectionData = new Map();
    this.boundingBox = new THREE.Box3();
    
    // Initialize empty geometries
    this.centerline = new THREE.Line(
      new THREE.BufferGeometry(),
      this.defaultMaterials.centerline
    );
    this.pavementMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.defaultMaterials.pavement
    );
    this.shoulderMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.defaultMaterials.shoulder
    );
    this.slopeMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.defaultMaterials.slope
    );
    
    // Add to group
    this.corridor.add(this.centerline);
    this.corridor.add(this.pavementMesh);
    this.corridor.add(this.shoulderMesh);
    this.corridor.add(this.slopeMesh);
    this.corridor.add(this.crossSections);
  }
  
  /**
   * Generate the 3D corridor model from alignment and profile data
   * 
   * @param params Corridor generation parameters
   * @returns THREE.Group containing the complete corridor model
   */
  public generateCorridor(params: CorridorParameters): THREE.Group {
    this.parameters = params;
    
    // Set default values if not provided
    const sampleInterval = params.sampleInterval || 10; // 10m default
    const stationStart = params.stationStart || 0;
    const stationEnd = params.stationEnd || this.getAlignmentLength(params.alignmentElements);
    
    // Clear previous data
    this.crossSectionData.clear();
    this.crossSections.clear();
    
    // Generate cross-sections at regular intervals
    const stations: number[] = [];
    for (let station = stationStart; station <= stationEnd; station += sampleInterval) {
      stations.push(station);
    }
    
    // Add the end station if not already included
    if (stations[stations.length - 1] < stationEnd) {
      stations.push(stationEnd);
    }
    
    // Generate cross-sections at each station
    const crossSectionResults = stations.map(station => {
      const result = this.generateCrossSectionAt(station);
      this.crossSectionData.set(station, result);
      return result;
    });
    
    // Generate 3D meshes from cross-sections
    this.generateCenterlineMesh(crossSectionResults);
    this.generatePavementMesh(crossSectionResults);
    this.generateShoulderMesh(crossSectionResults);
    this.generateSlopeMesh(crossSectionResults);
    
    // Calculate bounding box
    this.boundingBox.setFromObject(this.corridor);
    
    return this.corridor;
  }
  
  /**
   * Update the corridor visualization options
   * 
   * @param options Visualization options
   */
  public updateVisualization(options: CorridorVisualizationOptions): void {
    // Update materials if provided
    if (options.materialOptions) {
      if (options.materialOptions.pavement) {
        this.pavementMesh.material = options.materialOptions.pavement;
      }
      if (options.materialOptions.shoulder) {
        this.shoulderMesh.material = options.materialOptions.shoulder;
      }
      if (options.materialOptions.slope) {
        this.slopeMesh.material = options.materialOptions.slope;
      }
      if (options.materialOptions.centerline) {
        this.centerline.material = options.materialOptions.centerline;
      }
      if (options.materialOptions.crossSection) {
        this.crossSections.children.forEach(child => {
          if (child instanceof THREE.Line) {
            child.material = options.materialOptions.crossSection;
          }
        });
      }
    }
    
    // Show/hide centerline
    this.centerline.visible = options.showCenterline !== false;
    
    // Show/hide cross-sections
    this.crossSections.visible = options.showCrossSections === true;
    
    // Update cross-section spacing if needed
    if (options.crossSectionSpacing && options.showCrossSections) {
      this.updateCrossSectionVisibility(options.crossSectionSpacing);
    }
    
    // Highlight specific station if requested
    if (options.highlightStation !== undefined) {
      this.highlightCrossSection(options.highlightStation);
    }
  }
  
  /**
   * Get the 3D model as a Three.js Group
   */
  public getModel(): THREE.Group {
    return this.corridor;
  }
  
  /**
   * Get the bounding box of the corridor
   */
  public getBoundingBox(): THREE.Box3 {
    return this.boundingBox.clone();
  }
  
  /**
   * Get cross-section data at a specific station
   * 
   * @param station Station value in meters
   * @returns Cross-section data or null if not found
   */
  public getCrossSectionAt(station: number): CrossSectionResult | null {
    // Find exact match
    if (this.crossSectionData.has(station)) {
      return this.crossSectionData.get(station) || null;
    }
    
    // Find nearest station if no exact match
    let nearestStation = -1;
    let minDistance = Number.MAX_VALUE;
    
    this.crossSectionData.forEach((data, dataStation) => {
      const distance = Math.abs(dataStation - station);
      if (distance < minDistance) {
        minDistance = distance;
        nearestStation = dataStation;
      }
    });
    
    return nearestStation >= 0 ? this.crossSectionData.get(nearestStation) || null : null;
  }
  
  /**
   * Calculate earthwork volumes between stations
   * 
   * @param startStation Start station
   * @param endStation End station
   * @returns Volume data for cut, fill, and materials
   */
  public calculateVolumes(startStation: number, endStation: number): VolumeResult {
    // Implement average end area method for volume calculation
    // This is a placeholder implementation
    return {
      cutVolume: 0,
      fillVolume: 0,
      pavementVolume: 0,
      baseVolume: 0,
      subbaseVolume: 0
    };
  }
  
  /**
   * Generate a cross-section at a specific station
   * 
   * @param station Station value in meters
   * @returns Cross-section result with 3D points
   */
  private generateCrossSectionAt(station: number): CrossSectionResult {
    // Get horizontal position and bearing
    const horizontalData = this.getHorizontalPositionAt(station);
    if (!horizontalData) {
      throw new Error(`Could not determine horizontal position at station ${station}`);
    }
    
    // Get vertical elevation and grade
    const verticalData = this.getVerticalPositionAt(station);
    if (!verticalData) {
      throw new Error(`Could not determine vertical position at station ${station}`);
    }
    
    // Get superelevation at this station
    const superelevation = this.getSuperelevationAt(station);
    
    // Calculate 3D position of centerline
    const centerPoint: Point3D = {
      x: horizontalData.position.x,
      y: horizontalData.position.y,
      z: verticalData.elevation
    };
    
    // Calculate normal vector (perpendicular to alignment)
    const normalVector = {
      x: -Math.sin(horizontalData.bearing),
      y: Math.cos(horizontalData.bearing)
    };
    
    // Apply template to generate cross-section points
    const points: CrossSectionPoint3D[] = [];
    
    // Add centerline point
    points.push({
      position: { ...centerPoint },
      offset: 0,
      height: 0,
      code: 'CL',
      originalPoint: { offset: 0, height: 0, code: 'CL' }
    });
    
    // Process each template point
    this.parameters.template.points.forEach(templatePoint => {
      // Apply superelevation to height based on offset
      let adjustedHeight = templatePoint.height;
      
      if (templatePoint.offset < 0) {
        // Left side
        adjustedHeight += templatePoint.offset * superelevation.leftSlope;
      } else if (templatePoint.offset > 0) {
        // Right side
        adjustedHeight += templatePoint.offset * superelevation.rightSlope;
      }
      
      // Calculate 3D position
      const point: CrossSectionPoint3D = {
        position: {
          x: centerPoint.x + normalVector.x * templatePoint.offset,
          y: centerPoint.y + normalVector.y * templatePoint.offset,
          z: centerPoint.z + adjustedHeight
        },
        offset: templatePoint.offset,
        height: adjustedHeight,
        code: templatePoint.code,
        layer: templatePoint.layer,
        originalPoint: templatePoint
      };
      
      // If terrain is available, check for intersection
      if (this.parameters.terrain) {
        const terrainElevation = this.parameters.terrain.sampleElevation(point.position.x, point.position.y);
        point.terrainElevation = terrainElevation;
        
        // Calculate daylight point if needed (where slope meets terrain)
        if (templatePoint.code === 'HS' || templatePoint.code === 'FS') {
          const daylightPoint = this.calculateDaylightPoint(centerPoint, point, terrainElevation, templatePoint.offset < 0 ? -1 : 1);
          if (daylightPoint) {
            points.push(daylightPoint);
          }
        }
      }
      
      points.push(point);
    });
    
    // Create visual representation of this cross-section
    const geometry = new THREE.BufferGeometry();
    const vertices = points.map(p => new THREE.Vector3(p.position.x, p.position.y, p.position.z));
    geometry.setFromPoints(vertices);
    
    const line = new THREE.Line(geometry, this.defaultMaterials.crossSection);
    line.name = `CrossSection_${station}`;
    this.crossSections.add(line);
    
    return {
      station,
      centerPoint,
      points,
      bearing: horizontalData.bearing,
      grade: verticalData.grade,
      superelevation,
      line
    };
  }
  
  /**
   * Calculate the daylight point where the slope meets the terrain
   */
  private calculateDaylightPoint(
    centerPoint: Point3D,
    hingePoint: CrossSectionPoint3D,
    terrainElevation: number,
    direction: number
  ): CrossSectionPoint3D | null {
    // Simplified daylight calculation
    // In a real implementation, this would use ray-casting against the terrain TIN
    const slopeRatio = direction > 0 ? 2.0 : 3.0; // 2:1 for fill, 3:1 for cut
    const horizontalDistance = Math.abs(hingePoint.position.z - terrainElevation) * slopeRatio;
    
    // Calculate position
    const bearing = Math.atan2(
      hingePoint.position.y - centerPoint.y,
      hingePoint.position.x - centerPoint.x
    );
    
    const daylightPosition: Point3D = {
      x: hingePoint.position.x + Math.cos(bearing) * horizontalDistance,
      y: hingePoint.position.y + Math.sin(bearing) * horizontalDistance,
      z: terrainElevation
    };
    
    const offset = hingePoint.offset + horizontalDistance * direction;
    
    return {
      position: daylightPosition,
      offset,
      height: terrainElevation - centerPoint.z,
      code: 'DL',
      terrainElevation,
      originalPoint: { offset, height: 0, code: 'DL' }
    };
  }
  
  /**
   * Generate the centerline mesh
   */
  private generateCenterlineMesh(crossSections: CrossSectionResult[]): void {
    const points = crossSections.map(cs => {
      const centerPoint = cs.centerPoint;
      return new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z);
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.centerline.geometry.dispose();
    this.centerline.geometry = geometry;
  }
  
  /**
   * Generate the pavement mesh from cross-sections
   */
  private generatePavementMesh(crossSections: CrossSectionResult[]): void {
    const pavementGeometries: THREE.BufferGeometry[] = [];
    
    // Process each pair of adjacent cross-sections
    for (let i = 0; i < crossSections.length - 1; i++) {
      const current = crossSections[i];
      const next = crossSections[i + 1];
      
      // Extract pavement points (those with layer='pavement')
      const currentPavementPoints = current.points.filter(p => p.layer === 'pavement');
      const nextPavementPoints = next.points.filter(p => p.layer === 'pavement');
      
      if (currentPavementPoints.length > 0 && nextPavementPoints.length > 0) {
        // Create triangulated mesh between these cross-sections
        const geometry = this.createSurfaceBetweenCrossSections(
          currentPavementPoints,
          nextPavementPoints
        );
        
        if (geometry) {
          pavementGeometries.push(geometry);
        }
      }
    }
    
    // Merge all geometries
    if (pavementGeometries.length > 0) {
      const mergedGeometry = BufferGeometryUtils.mergeGeometries(pavementGeometries);
      this.pavementMesh.geometry.dispose();
      this.pavementMesh.geometry = mergedGeometry;
      
      // Calculate normals for proper lighting
      mergedGeometry.computeVertexNormals();
    }
  }
  
  /**
   * Generate the shoulder mesh from cross-sections
   */
  private generateShoulderMesh(crossSections: CrossSectionResult[]): void {
    const shoulderGeometries: THREE.BufferGeometry[] = [];
    
    // Similar to pavement mesh generation but for shoulder points
    for (let i = 0; i < crossSections.length - 1; i++) {
      const current = crossSections[i];
      const next = crossSections[i + 1];
      
      const currentShoulderPoints = current.points.filter(p => p.layer === 'shoulder');
      const nextShoulderPoints = next.points.filter(p => p.layer === 'shoulder');
      
      if (currentShoulderPoints.length > 0 && nextShoulderPoints.length > 0) {
        const geometry = this.createSurfaceBetweenCrossSections(
          currentShoulderPoints,
          nextShoulderPoints
        );
        
        if (geometry) {
          shoulderGeometries.push(geometry);
        }
      }
    }
    
    if (shoulderGeometries.length > 0) {
      const mergedGeometry = BufferGeometryUtils.mergeGeometries(shoulderGeometries);
      this.shoulderMesh.geometry.dispose();
      this.shoulderMesh.geometry = mergedGeometry;
      mergedGeometry.computeVertexNormals();
    }
  }
  
  /**
   * Generate the slope mesh from cross-sections
   */
  private generateSlopeMesh(crossSections: CrossSectionResult[]): void {
    const slopeGeometries: THREE.BufferGeometry[] = [];
    
    // Similar to pavement mesh generation but for slope points
    for (let i = 0; i < crossSections.length - 1; i++) {
      const current = crossSections[i];
      const next = crossSections[i + 1];
      
      const currentSlopePoints = current.points.filter(p => 
        p.layer === 'slope' || p.code === 'DL'
      );
      const nextSlopePoints = next.points.filter(p => 
        p.layer === 'slope' || p.code === 'DL'
      );
      
      if (currentSlopePoints.length > 0 && nextSlopePoints.length > 0) {
        const geometry = this.createSurfaceBetweenCrossSections(
          currentSlopePoints,
          nextSlopePoints
        );
        
        if (geometry) {
          slopeGeometries.push(geometry);
        }
      }
    }
    
    if (slopeGeometries.length > 0) {
      const mergedGeometry = BufferGeometryUtils.mergeGeometries(slopeGeometries);
      this.slopeMesh.geometry.dispose();
      this.slopeMesh.geometry = mergedGeometry;
      mergedGeometry.computeVertexNormals();
    }
  }
  
  /**
   * Create a triangulated surface between two cross-sections
   */
  private createSurfaceBetweenCrossSections(
    section1Points: CrossSectionPoint3D[],
    section2Points: CrossSectionPoint3D[]
  ): THREE.BufferGeometry | null {
    if (section1Points.length < 2 || section2Points.length < 2) {
      return null;
    }
    
    // Sort points by offset for consistent triangulation
    const sortedSection1 = [...section1Points].sort((a, b) => a.offset - b.offset);
    const sortedSection2 = [...section2Points].sort((a, b) => a.offset - b.offset);
    
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Add all vertices
    sortedSection1.forEach(point => {
      vertices.push(point.position.x, point.position.y, point.position.z);
    });
    
    sortedSection2.forEach(point => {
      vertices.push(point.position.x, point.position.y, point.position.z);
    });
    
    // Create triangles
    const section1Start = 0;
    const section2Start = sortedSection1.length;
    
    // Simple triangulation for different point counts
    if (sortedSection1.length === sortedSection2.length) {
      // Equal number of points - simple quad triangulation
      for (let i = 0; i < sortedSection1.length - 1; i++) {
        // First triangle
        indices.push(section1Start + i);
        indices.push(section1Start + i + 1);
        indices.push(section2Start + i);
        
        // Second triangle
        indices.push(section2Start + i);
        indices.push(section1Start + i + 1);
        indices.push(section2Start + i + 1);
      }
    } else {
      // Different number of points - more complex triangulation needed
      // This is a simplified approach - a real implementation would use
      // a more robust triangulation algorithm
      
      let i1 = 0;
      let i2 = 0;
      
      while (i1 < sortedSection1.length - 1 || i2 < sortedSection2.length - 1) {
        if (i1 < sortedSection1.length - 1 && i2 < sortedSection2.length - 1) {
          // Create two triangles for a quad
          indices.push(section1Start + i1);
          indices.push(section1Start + i1 + 1);
          indices.push(section2Start + i2);
          
          indices.push(section2Start + i2);
          indices.push(section1Start + i1 + 1);
          indices.push(section2Start + i2 + 1);
          
          i1++;
          i2++;
        } else if (i1 < sortedSection1.length - 1) {
          // More points in section 1
          indices.push(section1Start + i1);
          indices.push(section1Start + i1 + 1);
          indices.push(section2Start + i2);
          i1++;
        } else {
          // More points in section 2
          indices.push(section1Start + i1);
          indices.push(section2Start + i2 + 1);
          indices.push(section2Start + i2);
          i2++;
        }
      }
    }
    
    // Create buffer geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    
    return geometry;
  }
  
  /**
   * Update which cross-sections are visible based on spacing
   */
  private updateCrossSectionVisibility(spacing: number): void {
    const stations = Array.from(this.crossSectionData.keys()).sort((a, b) => a - b);
    
    // Show only cross-sections at the specified interval
    this.crossSections.children.forEach(child => {
      child.visible = false;
    });
    
    for (let i = 0; i < stations.length; i += Math.max(1, Math.round(spacing / this.parameters.sampleInterval!))) {
      const station = stations[i];
      const data = this.crossSectionData.get(station);
      if (data && data.line) {
        data.line.visible = true;
      }
    }
  }
  
  /**
   * Highlight a specific cross-section
   */
  private highlightCrossSection(station: number): void {
    // Reset all cross-sections to default material
    this.crossSections.children.forEach(child => {
      if (child instanceof THREE.Line) {
        child.material = this.defaultMaterials.crossSection;
      }
    });
    
    // Find and highlight the requested cross-section
    const data = this.getCrossSectionAt(station);
    if (data && data.line) {
      data.line.material = new THREE.LineBasicMaterial({
        color: 0x00FFFF,
        linewidth: 3
      });
      data.line.visible = true;
    }
  }
  
  /**
   * Get the total length of the alignment
   */
  private getAlignmentLength(elements: AlignmentElement[]): number {
    if (elements.length === 0) return 0;
    return elements[elements.length - 1].endStation;
  }
  
  /**
   * Get horizontal position and bearing at a specific station
   */
  private getHorizontalPositionAt(station: number): { position: Point2D, bearing: number } | null {
    // Find the element containing this station
    const element = this.parameters.alignmentElements.find(e => 
      station >= e.startStation && station <= e.endStation
    );
    
    if (!element) return null;
    
    // Distance along this element
    const s = station - element.startStation;
    
    let position: Point2D;
    let bearing: number;
    
    switch (element.type) {
      case AlignmentElementType.TANGENT:
        const tangent = element as any; // Type assertion
        position = {
          x: element.startPoint.x + s * Math.cos(tangent.bearing),
          y: element.startPoint.y + s * Math.sin(tangent.bearing)
        };
        bearing = tangent.bearing;
        break;
        
      case AlignmentElementType.CIRCULAR_CURVE:
        const curve = element as any; // Type assertion
        // Calculate angle from center to this point
        const centralAngle = s / curve.radius;
        // Starting angle from center to PC
        const startAngle = Math.atan2(
          curve.pc.y - curve.centerPoint.y,
          curve.pc.x - curve.centerPoint.x
        );
        // Angle adjustment based on direction
        const angleAdjust = curve.direction === 'right' ? centralAngle : -centralAngle;
        const angle = startAngle + angleAdjust;
        
        position = {
          x: curve.centerPoint.x + curve.radius * Math.cos(angle),
          y: curve.centerPoint.y + curve.radius * Math.sin(angle)
        };
        
        // Bearing is tangent to the curve at this point (90° offset from radius)
        bearing = angle + (curve.direction === 'right' ? Math.PI/2 : -Math.PI/2);
        break;
        
      case AlignmentElementType.SPIRAL:
        const spiral = element as any; // Type assertion
        // This is a simplified approximation
        // A real implementation would use proper spiral formulas
        position = {
          x: element.startPoint.x + s * Math.cos(element.bearing || 0),
          y: element.startPoint.y + s * Math.sin(element.bearing || 0)
        };
        bearing = element.bearing || 0;
        break;
        
      default:
        return null;
    }
    
    return { position, bearing };
  }
  
  /**
   * Get vertical position and grade at a specific station
   */
  private getVerticalPositionAt(station: number): { elevation: number, grade: number } | null {
    const profilePoints = this.parameters.profilePoints;
    
    if (!profilePoints || profilePoints.length === 0) {
      return null;
    }
    
    // If only one profile point, use it directly
    if (profilePoints.length === 1) {
      return {
        elevation: profilePoints[0].elevation,
        grade: profilePoints[0].grade
      };
    }
    
    // Find the profile segment containing this station
    let startPoint = profilePoints[0];
    let endPoint = profilePoints[0];
    
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (station >= profilePoints[i].station && station <= profilePoints[i + 1].station) {
        startPoint = profilePoints[i];
        endPoint = profilePoints[i + 1];
        break;
      }
    }
    
    // If station is beyond the last point, use the last segment
    if (station > profilePoints[profilePoints.length - 1].station) {
      startPoint = profilePoints[profilePoints.length - 2];
      endPoint = profilePoints[profilePoints.length - 1];
    }
    
    // Linear interpolation for elevation
    const segmentLength = endPoint.station - startPoint.station;
    if (segmentLength === 0) {
      return {
        elevation: startPoint.elevation,
        grade: startPoint.grade
      };
    }
    
    const t = (station - startPoint.station) / segmentLength;
    const elevation = startPoint.elevation + t * (endPoint.elevation - startPoint.elevation);
    
    // Linear interpolation for grade
    const grade = startPoint.grade + t * (endPoint.grade - startPoint.grade);
    
    return { elevation, grade };
  }
  
  /**
   * Get superelevation at a specific station
   */
  private getSuperelevationAt(station: number): { leftSlope: number, rightSlope: number } {
    // Default to no superelevation
    const defaultSuper = { leftSlope: 0, rightSlope: 0 };
    
    if (!this.parameters.superelevationData || this.parameters.superelevationData.length === 0) {
      return defaultSuper;
    }
    
    // Find the superelevation segment containing this station
    let startPoint = this.parameters.superelevationData[0];
    let endPoint = this.parameters.superelevationData[0];
    
    for (let i = 0; i < this.parameters.superelevationData.length - 1; i++) {
      if (station >= this.parameters.superelevationData[i].station && 
          station <= this.parameters.superelevationData[i + 1].station) {
        startPoint = this.parameters.superelevationData[i];
        endPoint = this.parameters.superelevationData[i + 1];
        break;
      }
    }
    
    // If station is beyond the last point, use the last values
    if (station > this.parameters.superelevationData[this.parameters.superelevationData.length - 1].station) {
      return {
        leftSlope: this.parameters.superelevationData[this.parameters.superelevationData.length - 1].leftSlope,
        rightSlope: this.parameters.superelevationData[this.parameters.superelevationData.length - 1].rightSlope
      };
    }
    
    // Linear interpolation
    const segmentLength = endPoint.station - startPoint.station;
    if (segmentLength === 0) {
      return {
        leftSlope: startPoint.leftSlope,
        rightSlope: startPoint.rightSlope
      };
    }
    
    const t = (station - startPoint.station) / segmentLength;
    
    return {
      leftSlope: startPoint.leftSlope + t * (endPoint.leftSlope - startPoint.leftSlope),
      rightSlope: startPoint.rightSlope + t * (endPoint.rightSlope - startPoint.rightSlope)
    };
  }
}

// Additional type definitions
export interface CrossSectionPoint3D {
  position: Point3D;
  offset: number;
  height: number;
  code: string;
  layer?: string;
  terrainElevation?: number;
  originalPoint: CrossSectionPoint;
}

export interface CrossSectionResult {
  station: number;
  centerPoint: Point3D;
  points: CrossSectionPoint3D[];
  bearing: number;
  grade: number;
  superelevation: { leftSlope: number, rightSlope: number };
  line: THREE.Line;
}

export interface VolumeResult {
  cutVolume: number;
  fillVolume: number;
  pavementVolume: number;
  baseVolume: number;
  subbaseVolume: number;
}

// Standard cross-section templates
export const StandardCrossSectionTemplates = {
  // Two-lane rural road (AASHTO)
  TwoLaneRural: {
    id: 'two-lane-rural',
    name: 'Two-Lane Rural Road',
    description: 'Standard two-lane rural road with shoulders',
    points: [
      { offset: -8.0, height: -0.6, code: 'FS', layer: 'slope' },     // Fill Slope
      { offset: -4.0, height: 0.0, code: 'HS', layer: 'slope' },      // Hinge/Shoulder
      { offset: -3.0, height: 0.0, code: 'ES', layer: 'shoulder' },   // Edge of Shoulder
      { offset: -3.6, height: 0.15, code: 'ETW', layer: 'pavement' }, // Edge of Travel Way
      { offset: 0.0, height: 0.15, code: 'CL', layer: 'pavement' },   // Centerline
      { offset: 3.6, height: 0.15, code: 'ETW', layer: 'pavement' },  // Edge of Travel Way
      { offset: 3.0, height: 0.0, code: 'ES', layer: 'shoulder' },    // Edge of Shoulder
      { offset: 4.0, height: 0.0, code: 'HS', layer: 'slope' },       // Hinge/Shoulder
      { offset: 8.0, height: -0.6, code: 'FS', layer: 'slope' }       // Fill Slope
    ],
    lanes: {
      laneCount: 2,
      laneWidth: 3.6,
      shoulderWidthLeft: 1.0,
      shoulderWidthRight: 1.0
    },
    superelevationPivot: 'centerline'
  },
  
  // Four-lane divided highway
  FourLaneDivided: {
    id: 'four-lane-divided',
    name: 'Four-Lane Divided Highway',
    description: 'Standard four-lane divided highway with median',
    points: [
      { offset: -14.0, height: -0.6, code: 'FS', layer: 'slope' },    // Fill Slope
      { offset: -10.0, height: 0.0, code: 'HS', layer: 'slope' },     // Hinge/Shoulder
      { offset: -9.0, height: 0.0, code: 'ES', layer: 'shoulder' },   // Edge of Shoulder
      { offset: -7.3, height: 0.15, code: 'ETW', layer: 'pavement' }, // Edge of Travel Way
      { offset: -3.7, height: 0.15, code: 'ETW', layer: 'pavement' }, // Edge of Travel Way
      { offset: -2.0, height: 0.0, code: 'EM', layer: 'median' },     // Edge of Median
      { offset: 2.0, height: 0.0, code: 'EM', layer: 'median' },      // Edge of Median
      { offset: 3.7, height: 0.15, code: 'ETW', layer: 'pavement' },  // Edge of Travel Way
      { offset: 7.3, height: 0.15, code: 'ETW', layer: 'pavement' },  // Edge of Travel Way
      { offset: 9.0, height: 0.0, code: 'ES', layer: 'shoulder' },    // Edge of Shoulder
      { offset: 10.0, height: 0.0, code: 'HS', layer: 'slope' },      // Hinge/Shoulder
      { offset: 14.0, height: -0.6, code: 'FS', layer: 'slope' }      // Fill Slope
    ],
    lanes: {
      laneCount: 4,
      laneWidth: 3.6,
      shoulderWidthLeft: 1.7,
      shoulderWidthRight: 1.7,
      medianWidth: 4.0
    },
    superelevationPivot: 'inside'
  }
};

export default RoadCorridorModel;
