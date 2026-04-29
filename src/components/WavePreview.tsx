import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildSolidGeometry } from "@/lib/wave-mesh";
import type { WaveParams } from "@/lib/wave-presets";

type Props = { params: WaveParams; dark: boolean };

export function WavePreview({ params, dark }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    mesh?: THREE.Mesh;
    raf?: number;
    rotating: boolean;
    drag?: { x: number; y: number };
    rot: { x: number; y: number };
    dist: number;
  }>({ rotating: true, rot: { x: -0.9, y: 0.6 }, dist: 1.7 });

  // init three
  useEffect(() => {
    const container = containerRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);

    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(400, 600, 500);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a55, 0.6);
    rim.position.set(-500, -200, 200);
    scene.add(rim);

    stateRef.current.renderer = renderer;
    stateRef.current.scene = scene;
    stateRef.current.camera = camera;

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // interaction
    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      stateRef.current.drag = { x: e.clientX, y: e.clientY };
      stateRef.current.rotating = false;
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const d = stateRef.current.drag;
      if (!d) return;
      const dx = (e.clientX - d.x) * 0.005;
      const dy = (e.clientY - d.y) * 0.005;
      stateRef.current.rot.y += dx;
      stateRef.current.rot.x += dy;
      stateRef.current.rot.x = Math.max(-1.4, Math.min(0.2, stateRef.current.rot.x));
      stateRef.current.drag = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      stateRef.current.drag = undefined;
      try { dom.releasePointerCapture(e.pointerId); } catch {}
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.dist *= 1 + e.deltaY * 0.001;
      stateRef.current.dist = Math.max(0.6, Math.min(4, stateRef.current.dist));
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const tick = () => {
      const s = stateRef.current;
      if (s.rotating) s.rot.y += 0.0025;
      if (s.mesh) {
        s.mesh.rotation.x = s.rot.x;
        s.mesh.rotation.z = s.rot.y;
      }
      // camera position
      const stockMax = Math.max(params.stockX, params.stockY, params.stockZ);
      const r = stockMax * s.dist;
      camera.position.set(0, -r * 0.9, r * 0.7);
      camera.lookAt(0, 0, 0);
      camera.up.set(0, 0, 1);
      renderer.render(scene, camera);
      s.raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(stateRef.current.raf!);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // background tied to theme
  useEffect(() => {
    const s = stateRef.current.scene;
    if (!s) return;
    s.background = new THREE.Color(dark ? 0x0e1014 : 0xf5f3ee);
  }, [dark]);

  // rebuild mesh on params change
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene) return;
    const geom = buildSolidGeometry(params);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9b3a1f,
      roughness: 0.55,
      metalness: 0.05,
      flatShading: false,
    });
    // wood-ish: blend with darker via vertex colors based on height
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color(0xc25a2a);
    const cMid = new THREE.Color(0x8a3415);
    const cBot = new THREE.Color(0x3d1a0c);
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z < zmin) zmin = z;
      if (z > zmax) zmax = z;
    }
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const t = (z - zmin) / Math.max(1e-6, zmax - zmin);
      const c = new THREE.Color();
      if (t < 0.5) c.copy(cBot).lerp(cMid, t * 2);
      else c.copy(cMid).lerp(cTop, (t - 0.5) * 2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    mat.vertexColors = true;

    if (s.mesh) {
      s.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    const mesh = new THREE.Mesh(geom, mat);
    s.scene.add(mesh);
    s.mesh = mesh;
  }, [params]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-border bg-background"
    >
      <div className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        drag · scroll to zoom
      </div>
    </div>
  );
}
