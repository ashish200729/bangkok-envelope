/**
 * Hand-built meshes for deck.gl's SimpleMeshLayer, flat shaded (one normal per face) for a clean
 * low-poly look. Units are metres; instances scale them.
 */
export type Mesh = {
  positions: { value: Float32Array; size: 3 };
  normals: { value: Float32Array; size: 3 };
  texCoords: { value: Float32Array; size: 2 };
};

type V3 = [number, number, number];

function fromTriangles(triangles: V3[][]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [a, b, c] of triangles) {
    if (!a || !b || !c) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ];
    const len = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    for (const p of [a, b, c]) {
      positions.push(...p);
      normals.push((n[0] ?? 0) / len, (n[1] ?? 0) / len, (n[2] ?? 0) / len);
    }
  }
  const count = positions.length / 3;
  return {
    positions: { value: new Float32Array(positions), size: 3 },
    normals: { value: new Float32Array(normals), size: 3 },
    texCoords: { value: new Float32Array(count * 2), size: 2 },
  };
}

/** Unit box: x and y from −0.5 to 0.5, z from 0 to 1. Counter-clockwise faces, outward normals. */
export const BOX_MESH: Mesh = (() => {
  const x0 = -0.5;
  const x1 = 0.5;
  const c: V3[] = [
    [x0, x0, 0],
    [x1, x0, 0],
    [x1, x1, 0],
    [x0, x1, 0],
    [x0, x0, 1],
    [x1, x0, 1],
    [x1, x1, 1],
    [x0, x1, 1],
  ];
  const quad = (a: number, b: number, d: number, e: number): V3[][] => {
    const [p, q, r, s] = [c[a], c[b], c[d], c[e]] as V3[];
    return [[p, q, r] as V3[], [p, r, s] as V3[]];
  };
  return fromTriangles([
    ...quad(4, 5, 6, 7),
    ...quad(3, 2, 1, 0),
    ...quad(0, 1, 5, 4),
    ...quad(1, 2, 6, 5),
    ...quad(2, 3, 7, 6),
    ...quad(3, 0, 4, 7),
  ]);
})();

/** Low-poly canopy: a slightly squashed sphere of radius 1 centred at z = 0. */
export const CANOPY_MESH: Mesh = (() => {
  const segments = 7;
  const rings = 4;
  const point = (i: number, j: number): V3 => {
    const theta = (i / segments) * Math.PI * 2;
    const phi = (j / rings) * Math.PI;
    return [Math.cos(theta) * Math.sin(phi), Math.sin(theta) * Math.sin(phi), Math.cos(phi) * 0.85];
  };
  const triangles: V3[][] = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = point(i, j);
      const b = point(i + 1, j);
      const c = point(i + 1, j + 1);
      const d = point(i, j + 1);
      if (j > 0) triangles.push([a, d, b]);
      if (j < rings - 1) triangles.push([b, d, c]);
    }
  }
  return fromTriangles(triangles);
})();
