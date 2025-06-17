/**
 * alignment_engine.ts
 * 
 * Core alignment calculation engine for road design based on AASHTO standards.
 * Handles horizontal alignment elements: tangents, circular curves, and spiral transitions.
 */

// Type definitions
export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export enum AlignmentElementType {
  TANGENT = 'tangent',
  CIRCULAR_CURVE = 'circular_curve',
  SPIRAL = 'spiral'
}

export interface AlignmentElement {
  type: AlignmentElementType;
  length: number;
  startStation: number;
  endStation: number;
  startPoint: Point2D;
  endPoint: Point2D;
  bearing?: number; // Radians
}

export interface Tangent extends AlignmentElement {
  type: AlignmentElementType.TANGENT;
  bearing: number; // Radians
}

export interface CircularCurve extends AlignmentElement {
  type: AlignmentElementType.CIRCULAR_CURVE;
  radius: number;
  direction: 'left' | 'right';
  centralAngle: number; // Radians
  pc: Point2D; // Point of curve
  pt: Point2D; // Point of tangent
  pi: Point2D; // Point of intersection
  centerPoint: Point2D;
  degreeCurve?: number; // Degree of curve (US customary)
}

export interface Spiral extends AlignmentElement {
  type: AlignmentElementType.SPIRAL;
  radiusStart: number; // Infinity for entry spiral from tangent
  radiusEnd: number; // Infinity for exit spiral to tangent
  direction: 'left' | 'right';
  A: number; // Spiral parameter
  Ls: number; // Spiral length
  theta: number; // Total spiral angle
  ts: Point2D; // Tangent to spiral
  sc: Point2D; // Spiral to curve
  cs: Point2D; // Curve to spiral
  st: Point2D; // Spiral to tangent
}

export interface DesignCriteria {
  designSpeed: number; // km/h
  maxSuperelevation: number; // e_max, decimal (0.08 = 8%)
  maxSideFriction: number; // f_max, decimal
  minRadiusOverride?: number; // Optional override for minimum radius
}

// AASHTO constants
export const AASHTO = {
  // Side friction factors from AASHTO Green Book (Table 3-7)
  sideFrictionFactors: {
    20: 0.17, 30: 0.16, 40: 0.15, 50: 0.14,
    60: 0.12, 70: 0.10, 80: 0.09, 90: 0.08,
    100: 0.07, 110: 0.06, 120: 0.05, 130: 0.05
  },
  // Default max superelevation rates (Table 3-8)
  maxSuperelevation: {
    rural: 0.08, // 8%
    urban: 0.06, // 6%
    snow: 0.04   // 4% (snow and ice regions)
  },
  // Spiral calculation constant (metric)
  spiralConstant: 46.5 // C for comfort (metric)
};

/**
 * Calculates the minimum radius for a given design speed and superelevation
 * Based on AASHTO Green Book Equation 3-8
 * R = V² / [127 * (e + f)]
 * 
 * @param designSpeed Design speed in km/h
 * @param eMax Maximum superelevation rate (decimal)
 * @param fMax Maximum side friction factor (decimal)
 * @returns Minimum radius in meters
 */
export function calculateMinimumRadius(
  designSpeed: number,
  eMax: number,
  fMax: number
): number {
  // Convert km/h to m/s for calculation
  const v = designSpeed / 3.6;
  // AASHTO formula: R = V² / [g * (e + f)]
  // Where g = 9.81 m/s²
  return (v * v) / (9.81 * (eMax + fMax));
}

/**
 * Gets the maximum side friction factor for a given design speed
 * Interpolates between values from AASHTO Green Book Table 3-7
 * 
 * @param designSpeed Design speed in km/h
 * @returns Maximum side friction factor
 */
export function getMaxSideFriction(designSpeed: number): number {
  const speeds = Object.keys(AASHTO.sideFrictionFactors).map(Number).sort((a, b) => a - b);
  
  // Exact match
  if (AASHTO.sideFrictionFactors[designSpeed as keyof typeof AASHTO.sideFrictionFactors]) {
    return AASHTO.sideFrictionFactors[designSpeed as keyof typeof AASHTO.sideFrictionFactors];
  }
  
  // Find speeds to interpolate between
  let lowerSpeed = speeds[0];
  let upperSpeed = speeds[speeds.length - 1];
  
  for (let i = 0; i < speeds.length; i++) {
    if (speeds[i] > designSpeed) {
      upperSpeed = speeds[i];
      lowerSpeed = speeds[i - 1];
      break;
    }
  }
  
  // Linear interpolation
  const lowerFriction = AASHTO.sideFrictionFactors[lowerSpeed as keyof typeof AASHTO.sideFrictionFactors];
  const upperFriction = AASHTO.sideFrictionFactors[upperSpeed as keyof typeof AASHTO.sideFrictionFactors];
  
  return lowerFriction + (designSpeed - lowerSpeed) * 
    (upperFriction - lowerFriction) / (upperSpeed - lowerSpeed);
}

/**
 * Calculates the minimum spiral length based on design speed and curve radius
 * AASHTO Equation 3-38: Ls = (V³) / (C * R)
 * 
 * @param designSpeed Design speed in km/h
 * @param radius Curve radius in meters
 * @returns Minimum spiral length in meters
 */
export function calculateMinSpiralLength(designSpeed: number, radius: number): number {
  return Math.pow(designSpeed, 3) / (AASHTO.spiralConstant * radius);
}

/**
 * Calculates the coordinates along a clothoid spiral
 * Uses Fresnel integrals approximation
 * 
 * @param A Spiral parameter (A = sqrt(R*L))
 * @param length Total spiral length
 * @param s Distance along spiral from TS
 * @returns {x, y} coordinates
 */
export function calculateSpiralCoordinates(A: number, length: number, s: number): Point2D {
  // Normalized distance along spiral
  const t = s / length;
  
  // Spiral angle at distance s
  const theta = Math.pow(s, 2) / (2 * A * A);
  
  // Fresnel integrals approximation
  let x = s;
  let y = 0;
  
  // Terms in the series
  const terms = 5;
  
  for (let n = 1; n <= terms; n++) {
    const term = Math.pow(-1, n) * Math.pow(theta, 2 * n) / 
                 (factorial(2 * n) * (4 * n - 1));
    x -= s * term;
    
    const yTerm = Math.pow(-1, n - 1) * Math.pow(theta, 2 * n - 1) / 
                  (factorial(2 * n - 1) * (4 * n - 3));
    y += s * yTerm;
  }
  
  return { x, y };
}

/**
 * Helper function to calculate factorial
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

/**
 * Calculate the length of a circular curve
 * 
 * @param radius Radius of the curve in meters
 * @param deltaAngle Central angle in radians
 * @returns Length of the curve in meters
 */
export function calculateCurveLength(radius: number, deltaAngle: number): number {
  return radius * Math.abs(deltaAngle);
}

/**
 * Calculate the central angle of a circular curve
 * 
 * @param radius Radius of the curve in meters
 * @param length Length of the curve in meters
 * @returns Central angle in radians
 */
export function calculateCentralAngle(radius: number, length: number): number {
  return length / radius;
}

/**
 * Check if a curve radius meets AASHTO standards
 * 
 * @param radius Curve radius in meters
 * @param criteria Design criteria
 * @returns True if the radius meets standards
 */
export function isRadiusCompliant(radius: number, criteria: DesignCriteria): boolean {
  const { designSpeed, maxSuperelevation, maxSideFriction } = criteria;
  
  // Calculate minimum radius per AASHTO
  const minRadius = criteria.minRadiusOverride || 
    calculateMinimumRadius(designSpeed, maxSuperelevation, maxSideFriction);
  
  return radius >= minRadius;
}

/**
 * Check if a spiral length meets AASHTO standards
 * 
 * @param spiralLength Spiral length in meters
 * @param radius Curve radius in meters
 * @param criteria Design criteria
 * @returns True if the spiral length meets standards
 */
export function isSpiralLengthCompliant(
  spiralLength: number, 
  radius: number, 
  criteria: DesignCriteria
): boolean {
  const minLength = calculateMinSpiralLength(criteria.designSpeed, radius);
  return spiralLength >= minLength;
}

/**
 * Create a tangent alignment element
 * 
 * @param startPoint Start point coordinates
 * @param endPoint End point coordinates
 * @param startStation Starting station value
 * @returns Tangent element
 */
export function createTangent(
  startPoint: Point2D, 
  endPoint: Point2D, 
  startStation: number
): Tangent {
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const bearing = Math.atan2(dy, dx);
  
  return {
    type: AlignmentElementType.TANGENT,
    length,
    startStation,
    endStation: startStation + length,
    startPoint,
    endPoint,
    bearing
  };
}

/**
 * Create a circular curve element
 * 
 * @param pi Point of intersection
 * @param radius Curve radius
 * @param incomingBearing Bearing of incoming tangent (radians)
 * @param outgoingBearing Bearing of outgoing tangent (radians)
 * @param startStation Starting station value
 * @returns Circular curve element
 */
export function createCircularCurve(
  pi: Point2D,
  radius: number,
  incomingBearing: number,
  outgoingBearing: number,
  startStation: number
): CircularCurve {
  // Calculate deflection angle
  let deflection = outgoingBearing - incomingBearing;
  while (deflection > Math.PI) deflection -= 2 * Math.PI;
  while (deflection < -Math.PI) deflection += 2 * Math.PI;
  
  // Determine curve direction
  const direction = deflection > 0 ? 'right' : 'left';
  const centralAngle = Math.abs(deflection);
  
  // Calculate tangent distance
  const T = radius * Math.tan(centralAngle / 2);
  
  // Calculate PC (point of curve)
  const pc: Point2D = {
    x: pi.x - T * Math.cos(incomingBearing),
    y: pi.y - T * Math.sin(incomingBearing)
  };
  
  // Calculate PT (point of tangent)
  const pt: Point2D = {
    x: pi.x + T * Math.cos(outgoingBearing),
    y: pi.y + T * Math.sin(outgoingBearing)
  };
  
  // Calculate curve length
  const length = calculateCurveLength(radius, centralAngle);
  
  // Calculate center point
  const bearingToCenter = incomingBearing + (direction === 'right' ? Math.PI/2 : -Math.PI/2);
  const centerPoint: Point2D = {
    x: pc.x + radius * Math.cos(bearingToCenter),
    y: pc.y + radius * Math.sin(bearingToCenter)
  };
  
  return {
    type: AlignmentElementType.CIRCULAR_CURVE,
    radius,
    direction,
    centralAngle,
    length,
    startStation,
    endStation: startStation + length,
    startPoint: pc,
    endPoint: pt,
    pc,
    pt,
    pi,
    centerPoint,
    // US customary degree of curve (optional)
    degreeCurve: (180 * 100) / (Math.PI * radius)
  };
}

/**
 * Create a spiral transition element
 * 
 * @param startPoint Start point of spiral
 * @param startRadius Starting radius (Infinity for entry spiral)
 * @param endRadius Ending radius (Infinity for exit spiral)
 * @param length Spiral length
 * @param startBearing Starting bearing in radians
 * @param direction Direction of spiral ('left' or 'right')
 * @param startStation Starting station value
 * @returns Spiral element
 */
export function createSpiral(
  startPoint: Point2D,
  startRadius: number,
  endRadius: number,
  length: number,
  startBearing: number,
  direction: 'left' | 'right',
  startStation: number
): Spiral {
  // Calculate spiral parameter A
  // For entry spiral (tangent to curve): A = sqrt(R * L)
  // For exit spiral (curve to tangent): A = sqrt(R * L)
  // For compound spiral: more complex calculation needed
  
  const R = isFinite(startRadius) ? startRadius : endRadius;
  const A = Math.sqrt(R * length);
  
  // Total spiral angle
  const theta = length / (2 * R);
  
  // Calculate end point using Fresnel integrals
  const coords = calculateSpiralCoordinates(A, length, length);
  
  // Rotate and translate to match start bearing and position
  const rotatedX = coords.x * Math.cos(startBearing) - coords.y * Math.sin(startBearing);
  const rotatedY = coords.x * Math.sin(startBearing) + coords.y * Math.cos(startBearing);
  
  const endPoint: Point2D = {
    x: startPoint.x + rotatedX,
    y: startPoint.y + rotatedY
  };
  
  // For a complete implementation, we'd need to calculate ts, sc, cs, st points
  // These are simplified placeholders
  const ts = startPoint;
  const st = endPoint;
  const sc = { x: (startPoint.x + endPoint.x) / 2, y: (startPoint.y + endPoint.y) / 2 };
  const cs = sc;
  
  return {
    type: AlignmentElementType.SPIRAL,
    radiusStart: startRadius,
    radiusEnd: endRadius,
    direction,
    A,
    Ls: length,
    theta,
    length,
    startStation,
    endStation: startStation + length,
    startPoint,
    endPoint,
    ts,
    sc,
    cs,
    st
  };
}

/**
 * Alignment class to manage a complete horizontal alignment
 */
export class Alignment {
  elements: AlignmentElement[] = [];
  designCriteria: DesignCriteria;
  
  constructor(designCriteria: DesignCriteria) {
    this.designCriteria = designCriteria;
  }
  
  /**
   * Add an element to the alignment
   */
  addElement(element: AlignmentElement): void {
    // Set the start station if this is the first element
    if (this.elements.length === 0) {
      element.startStation = 0;
      element.endStation = element.length;
    } else {
      const prevElement = this.elements[this.elements.length - 1];
      element.startStation = prevElement.endStation;
      element.endStation = element.startStation + element.length;
    }
    
    this.elements.push(element);
  }
  
  /**
   * Get station and offset from x,y coordinates
   */
  getStationOffset(point: Point2D): { station: number, offset: number } | null {
    // Implementation would find the nearest point on alignment
    // and calculate station and perpendicular offset
    // This is a complex calculation requiring perpendicular projection
    
    // Placeholder implementation
    return null;
  }
  
  /**
   * Get x,y coordinates from station and offset
   */
  getCoordinates(station: number, offset: number = 0): Point2D | null {
    // Find the element containing this station
    const element = this.elements.find(e => 
      station >= e.startStation && station <= e.endStation
    );
    
    if (!element) return null;
    
    // Distance along this element
    const s = station - element.startStation;
    
    let point: Point2D;
    
    switch (element.type) {
      case AlignmentElementType.TANGENT:
        const tangent = element as Tangent;
        point = {
          x: element.startPoint.x + s * Math.cos(tangent.bearing),
          y: element.startPoint.y + s * Math.sin(tangent.bearing)
        };
        break;
        
      case AlignmentElementType.CIRCULAR_CURVE:
        const curve = element as CircularCurve;
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
        
        point = {
          x: curve.centerPoint.x + curve.radius * Math.cos(angle),
          y: curve.centerPoint.y + curve.radius * Math.sin(angle)
        };
        break;
        
      case AlignmentElementType.SPIRAL:
        const spiral = element as Spiral;
        // This is a simplified approximation
        const coords = calculateSpiralCoordinates(spiral.A, spiral.length, s);
        // Would need proper rotation and translation based on spiral parameters
        point = {
          x: element.startPoint.x + coords.x,
          y: element.startPoint.y + coords.y
        };
        break;
        
      default:
        return null;
    }
    
    // Apply offset if needed (perpendicular to alignment)
    if (offset !== 0) {
      // Would need to calculate bearing at this station
      // and offset perpendicular to it
      // Simplified placeholder
    }
    
    return point;
  }
  
  /**
   * Check if the alignment meets AASHTO standards
   */
  checkCompliance(): { compliant: boolean, issues: string[] } {
    const issues: string[] = [];
    let compliant = true;
    
    this.elements.forEach((element, index) => {
      if (element.type === AlignmentElementType.CIRCULAR_CURVE) {
        const curve = element as CircularCurve;
        if (!isRadiusCompliant(curve.radius, this.designCriteria)) {
          issues.push(`Curve ${index + 1} radius (${curve.radius.toFixed(2)}m) is less than minimum required for ${this.designCriteria.designSpeed} km/h`);
          compliant = false;
        }
      } else if (element.type === AlignmentElementType.SPIRAL) {
        const spiral = element as Spiral;
        const radius = isFinite(spiral.radiusStart) ? spiral.radiusStart : spiral.radiusEnd;
        if (!isSpiralLengthCompliant(spiral.length, radius, this.designCriteria)) {
          issues.push(`Spiral ${index + 1} length (${spiral.length.toFixed(2)}m) is less than minimum required for ${this.designCriteria.designSpeed} km/h and radius ${radius.toFixed(2)}m`);
          compliant = false;
        }
      }
    });
    
    return { compliant, issues };
  }
  
  /**
   * Export alignment to GeoJSON format
   */
  toGeoJSON(): any {
    const features = [];
    let coordinates: Point2D[] = [];
    
    // Sample the alignment at regular intervals
    const sampleInterval = 10; // meters
    const startStation = 0;
    const endStation = this.elements[this.elements.length - 1]?.endStation || 0;
    
    for (let station = startStation; station <= endStation; station += sampleInterval) {
      const point = this.getCoordinates(station);
      if (point) {
        coordinates.push([point.x, point.y]);
      }
    }
    
    features.push({
      type: "Feature",
      properties: {
        name: "Alignment",
        designSpeed: this.designCriteria.designSpeed
      },
      geometry: {
        type: "LineString",
        coordinates
      }
    });
    
    return {
      type: "FeatureCollection",
      features
    };
  }
}
