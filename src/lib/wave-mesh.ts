import * as THREE from "three";
import { heightAt, type WaveParams } from "./wave-presets";

export type MeshData = {
  positions: Float32Array; // top surface only, for preview/export
  indices: Uint32Array;
  resX: number;
  resY: number;
};

/** Build a top-surface heightfield in stock coordinates (mm). Centered on origin, +Z up. */
export function buildHeightfield(p: WaveParams): MeshData {
  const resX = Math.max(8, Math.min(600, Math.floor(p.resolution)));
  const resY = resX;
  const hx = p.stockX / 2;
  const hy = p.stockY / 2;
  const positions = new Float32Array(resX * resY * 3);
  const indices = new Uint32Array((resX - 1) * (resY - 1) * 6);
  const maxH = Math.min(p.amplitude, p.stockZ - p.baseThickness);
  const baseZ = p.baseThickness;

  for (let j = 0; j < resY; j++) {
    const v = (j / (resY - 1)) * 2 - 1;
    const y = v * hy;
    for (let i = 0; i < resX; i++) {
      const u = (i / (resX - 1)) * 2 - 1;
      const x = u * hx;
      const h = heightAt(u, v, p);
      const z = baseZ + h * maxH;
      const o = (j * resX + i) * 3;
      positions[o] = x;
      positions[o + 1] = y;
      positions[o + 2] = z;
    }
  }

  let k = 0;
  for (let j = 0; j < resY - 1; j++) {
    for (let i = 0; i < resX - 1; i++) {
      const a = j * resX + i;
      const b = a + 1;
      const c = a + resX;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  return { positions, indices, resX, resY };
}

/** Build a closed solid (top wave + base box) THREE.BufferGeometry. */
export function buildSolidGeometry(p: WaveParams): THREE.BufferGeometry {
  const top = buildHeightfield(p);
  const { resX, resY, positions: topPos } = top;

  const hx = p.stockX / 2;
  const hy = p.stockY / 2;

  const topCount = resX * resY;
  const bottom = [
    -hx, -hy, 0,
     hx, -hy, 0,
     hx,  hy, 0,
    -hx,  hy, 0,
  ];
  const totalVerts = topCount + 4;
  const positions = new Float32Array(totalVerts * 3);
  positions.set(topPos, 0);
  positions.set(bottom, topCount * 3);

  const bottomBase = topCount;
  const BL = bottomBase + 0;
  const BR = bottomBase + 1;
  const TR = bottomBase + 2;
  const TL = bottomBase + 3;

  const topFaceCount = (resX - 1) * (resY - 1) * 2;
  const sideTri =
    (resX - 1) * 2 * 2 +
    (resY - 1) * 2 * 2;
  const totalIdx = (topFaceCount + 2 + sideTri) * 3;
  const indices = new Uint32Array(totalIdx);
  let k = 0;

  // Top surface — CCW viewed from +Z
  for (let j = 0; j < resY - 1; j++) {
    for (let i = 0; i < resX - 1; i++) {
      const a = j * resX + i;
      const b = a + 1;
      const c = a + resX;
      const d = c + 1;
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = b; indices[k++] = d; indices[k++] = c;
    }
  }
  // Bottom face — CCW viewed from -Z (so CW from above)
  indices[k++] = BL; indices[k++] = TR; indices[k++] = BR;
  indices[k++] = BL; indices[k++] = TL; indices[k++] = TR;

  // Side at y = -hy (front), normal -Y
  for (let i = 0; i < resX - 1; i++) {
    const t0 = 0 * resX + i;
    const t1 = 0 * resX + (i + 1);
    indices[k++] = t0; indices[k++] = BL; indices[k++] = t1;
    indices[k++] = t1; indices[k++] = BL; indices[k++] = BR;
  }
  // Side at y = +hy (back), normal +Y
  for (let i = 0; i < resX - 1; i++) {
    const t0 = (resY - 1) * resX + i;
    const t1 = (resY - 1) * resX + (i + 1);
    indices[k++] = t0; indices[k++] = t1; indices[k++] = TR;
    indices[k++] = t0; indices[k++] = TR; indices[k++] = TL;
  }
  // Side at x = -hx (left), normal -X
  for (let j = 0; j < resY - 1; j++) {
    const t0 = j * resX + 0;
    const t1 = (j + 1) * resX + 0;
    indices[k++] = t0; indices[k++] = t1; indices[k++] = TL;
    indices[k++] = t0; indices[k++] = TL; indices[k++] = BL;
  }
  // Side at x = +hx (right), normal +X
  for (let j = 0; j < resY - 1; j++) {
    const t0 = j * resX + (resX - 1);
    const t1 = (j + 1) * resX + (resX - 1);
    indices[k++] = t0; indices[k++] = BR; indices[k++] = t1;
    indices[k++] = t1; indices[k++] = BR; indices[k++] = TR;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/** Export a BufferGeometry as binary STL (Uint8Array). */
export function geometryToBinarySTL(geom: THREE.BufferGeometry): Uint8Array {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const idx = geom.getIndex();
  if (!idx) throw new Error("Geometry must be indexed");
  const triCount = idx.count / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true);
  let offset = 84;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = idx.getX(t * 3);
    const i1 = idx.getX(t * 3 + 1);
    const i2 = idx.getX(t * 3 + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();
    view.setFloat32(offset, n.x, true); offset += 4;
    view.setFloat32(offset, n.y, true); offset += 4;
    view.setFloat32(offset, n.z, true); offset += 4;
    view.setFloat32(offset, a.x, true); offset += 4;
    view.setFloat32(offset, a.y, true); offset += 4;
    view.setFloat32(offset, a.z, true); offset += 4;
    view.setFloat32(offset, b.x, true); offset += 4;
    view.setFloat32(offset, b.y, true); offset += 4;
    view.setFloat32(offset, b.z, true); offset += 4;
    view.setFloat32(offset, c.x, true); offset += 4;
    view.setFloat32(offset, c.y, true); offset += 4;
    view.setFloat32(offset, c.z, true); offset += 4;
    view.setUint16(offset, 0, true); offset += 2;
  }
  return new Uint8Array(buffer);
}
