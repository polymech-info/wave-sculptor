import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { WavePreview } from "@/components/WavePreview";
import { ParamSlider } from "@/components/ParamSlider";
import {
  DEFAULT_PARAMS,
  PRESETS,
  type WaveParams,
} from "@/lib/wave-presets";
import { buildSolidGeometry, geometryToBinarySTL } from "@/lib/wave-mesh";

export const Route = createFileRoute("/")({
  component: WaveStudio,
  head: () => ({
    meta: [
      { title: "Wave Studio — Parametric heightfield generator" },
      { name: "description", content: "Generate parametric wave panels and export STL ready for CNC or 3D printing." },
    ],
  }),
});

const LS_PARAMS = "wavestudio.params.v1";
const LS_THEME = "wavestudio.theme.v1";
const LS_SAVED = "wavestudio.saved.v1";

type SavedEntry = { id: string; name: string; params: WaveParams; createdAt: number };

function loadParams(): WaveParams {
  try {
    const raw = localStorage.getItem(LS_PARAMS);
    if (!raw) return DEFAULT_PARAMS;
    return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PARAMS;
  }
}
function loadSaved(): SavedEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_SAVED) || "[]"); } catch { return []; }
}

function WaveStudio() {
  const [params, setParams] = useState<WaveParams>(DEFAULT_PARAMS);
  const [dark, setDark] = useState(true);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // hydrate from localStorage (client only)
  useEffect(() => {
    setParams(loadParams());
    setSaved(loadSaved());
    const t = localStorage.getItem(LS_THEME);
    setDark(t ? t === "dark" : true);
    setHydrated(true);
  }, []);

  // apply theme
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(LS_THEME, dark ? "dark" : "light");
  }, [dark, hydrated]);

  // persist params
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_PARAMS, JSON.stringify(params));
  }, [params, hydrated]);

  const update = <K extends keyof WaveParams>(k: K, v: WaveParams[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setParams((cur) => ({ ...cur, preset: presetId, ...p.defaults }));
  };

  const exportSTL = () => {
    const geom = buildSolidGeometry(params);
    const data = geometryToBinarySTL(geom);
    const blob = new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wave-${params.preset}-${params.stockX}x${params.stockY}x${params.stockZ}.stl`;
    a.click();
    URL.revokeObjectURL(a.href);
    geom.dispose();
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(params, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wave-settings-${params.preset}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        setParams({ ...DEFAULT_PARAMS, ...obj });
      } catch (e) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  const saveCurrent = () => {
    const name = prompt("Name this preset:", `${params.preset} ${new Date().toLocaleString()}`);
    if (!name) return;
    const entry: SavedEntry = {
      id: crypto.randomUUID(),
      name,
      params,
      createdAt: Date.now(),
    };
    const next = [entry, ...saved];
    setSaved(next);
    localStorage.setItem(LS_SAVED, JSON.stringify(next));
  };
  const removeSaved = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    localStorage.setItem(LS_SAVED, JSON.stringify(next));
  };

  const currentPreset = useMemo(
    () => PRESETS.find((p) => p.id === params.preset) ?? PRESETS[0],
    [params.preset],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
              <path d="M2 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0" opacity=".5"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-base font-semibold leading-none">Wave Studio</h1>
            <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              parametric heightfield · stl export
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDark((v) => !v)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            title="Toggle theme"
          >
            {dark ? "☾ Dark" : "☀ Light"}
          </button>
          <button
            onClick={exportSTL}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Export STL
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-panel p-4">
          {/* Presets */}
          <section>
            <SectionTitle>Pattern Preset</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={
                    "flex flex-col items-start rounded-md border px-2.5 py-2 text-left text-xs transition " +
                    (params.preset === p.id
                      ? "border-primary bg-accent shadow-sm"
                      : "border-border bg-card hover:border-border-strong hover:bg-accent/50")
                  }
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{p.description}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Stock */}
          <section>
            <SectionTitle>Stock Size (mm)</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="X" value={params.stockX} onChange={(v) => update("stockX", v)} />
              <NumberField label="Y" value={params.stockY} onChange={(v) => update("stockY", v)} />
              <NumberField label="Z" value={params.stockZ} onChange={(v) => update("stockZ", v)} />
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Default 500×500×60. The wave fills X,Y; height is bounded by Z − base.
            </p>
          </section>

          {/* Geometry */}
          <section className="space-y-3">
            <SectionTitle>Geometry</SectionTitle>
            <ParamSlider label="Resolution" value={params.resolution} min={32} max={500} step={1} unit="pts"
              onChange={(v) => update("resolution", v)} />
            <ParamSlider label="Base thickness" value={params.baseThickness} min={1} max={Math.max(2, params.stockZ - 1)} step={1} unit="mm"
              onChange={(v) => update("baseThickness", v)} />
            <ParamSlider label="Amplitude" value={params.amplitude} min={1} max={Math.max(2, params.stockZ - params.baseThickness)} step={0.5} unit="mm"
              onChange={(v) => update("amplitude", v)} />
          </section>

          {/* Pattern */}
          <section className="space-y-3">
            <SectionTitle>{currentPreset.name} Parameters</SectionTitle>
            <ParamSlider label="Frequency X" value={params.freqX} min={0.2} max={12} step={0.1}
              onChange={(v) => update("freqX", v)} />
            <ParamSlider label="Frequency Y" value={params.freqY} min={0.2} max={12} step={0.1}
              onChange={(v) => update("freqY", v)} />
            <ParamSlider label="Phase" value={params.phase} min={0} max={2} step={0.01}
              onChange={(v) => update("phase", v)} />
            <ParamSlider label="Warp" value={params.warp} min={0} max={2} step={0.01}
              onChange={(v) => update("warp", v)} />
            <ParamSlider label="Ridges / Octaves" value={params.ridges} min={1} max={10} step={1}
              onChange={(v) => update("ridges", v)} />
            <ParamSlider label="Seed" value={params.seed} min={0} max={50} step={1}
              onChange={(v) => update("seed", v)} />
            <ParamSlider label="Height variance" value={params.heightVariance} min={0} max={1} step={0.01}
              onChange={(v) => update("heightVariance", v)} />
          </section>

          {/* Saved */}
          <section>
            <SectionTitle>Saved Settings</SectionTitle>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <SmallBtn onClick={saveCurrent}>+ Save current</SmallBtn>
              <SmallBtn onClick={exportJSON}>Export JSON</SmallBtn>
              <SmallBtn onClick={() => fileRef.current?.click()}>Import JSON</SmallBtn>
              <input ref={fileRef} type="file" accept="application/json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ""; }} />
            </div>
            <div className="space-y-1">
              {saved.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
                  No saved settings yet.
                </p>
              )}
              {saved.map((s) => (
                <div key={s.id} className="group flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                  <button
                    className="flex-1 truncate text-left"
                    onClick={() => setParams({ ...DEFAULT_PARAMS, ...s.params })}
                    title={s.name}
                  >
                    {s.name}
                  </button>
                  <button
                    onClick={() => removeSaved(s.id)}
                    className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>Reset</SectionTitle>
            <SmallBtn onClick={() => setParams(DEFAULT_PARAMS)}>Restore defaults</SmallBtn>
          </section>
        </aside>

        {/* Preview */}
        <main className="relative flex-1 grid-bg p-4">
          <div className="h-full w-full">
            <WavePreview params={params} dark={dark} />
          </div>
          <div className="pointer-events-none absolute left-6 top-6 max-w-[260px] rounded-md border border-border bg-card/80 p-3 backdrop-blur">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</div>
            <div className="font-display text-lg font-semibold">{currentPreset.name}</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              {params.stockX} × {params.stockY} × {params.stockZ} mm · {params.resolution}² grid
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              base {params.baseThickness}mm · amp {params.amplitude}mm
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
    >
      {children}
    </button>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        min={10}
        max={2000}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="w-full rounded-md border border-border bg-input px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
