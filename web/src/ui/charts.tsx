// Gráficos propios en SVG: livianos, un solo estilo, con texto alternativo.
// Colores de significado fijo: verde a favor, rojo en contra, ámbar atención. Siempre con etiqueta.
import { clp } from "../money/format";

export function Progress({ value, color = "var(--green)", thin, label }: { value: number; color?: string; thin?: boolean; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div class={`bar${thin ? " thin" : ""}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, size = 84, color = "var(--green)", center, label }: { value: number; size?: number; color?: string; center: string; label: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" stroke-width="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} stroke-width="8" stroke-linecap="round" stroke-dasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)">
        {center}
      </text>
    </svg>
  );
}

// Barras agrupadas: ingresos (verde) contra egresos (rojo) por mes.
export function BarsIO({ data, label }: { data: { etiqueta: string; ingresos: number; egresos: number }[]; label: string }) {
  const W = 320;
  const H = 150;
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.egresos]));
  const slot = W / Math.max(1, data.length);
  const bw = Math.min(16, slot / 3);
  const alt = data.map((d) => `${d.etiqueta}: entró ${clp(d.ingresos)}, salió ${clp(d.egresos)}`).join(". ");
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}`}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
        {data.map((d, i) => {
          const x = i * slot + slot / 2;
          const hi = (d.ingresos / max) * (H - 8);
          const he = (d.egresos / max) * (H - 8);
          return (
            <g key={d.etiqueta}>
              <rect x={x - bw - 2} y={H - hi} width={bw} height={hi} rx="3" fill="var(--green)" />
              <rect x={x + 2} y={H - he} width={bw} height={he} rx="3" fill="var(--red)" />
              <text x={x} y={H + 16} text-anchor="middle" font-size="11" fill="var(--muted)">
                {d.etiqueta}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption class="row small" style={{ gap: "14px" }}>
        <span class="row" style={{ gap: "6px" }}>
          <i style={{ width: "10px", height: "10px", borderRadius: "3px", background: "var(--green)", display: "inline-block" }} />
          Entra
        </span>
        <span class="row" style={{ gap: "6px" }}>
          <i style={{ width: "10px", height: "10px", borderRadius: "3px", background: "var(--red)", display: "inline-block" }} />
          Sale
        </span>
      </figcaption>
    </figure>
  );
}

// Barras horizontales: gasto por categoría.
export function BarsH({ data, total, label }: { data: { nombre: string; valor: number }[]; total: number; label: string }) {
  return (
    <div class="stack" role="list" aria-label={label}>
      {data.map((d) => (
        <div role="listitem" key={d.nombre} class="stack" style={{ gap: "4px" }}>
          <div class="between" style={{ fontSize: "14px" }}>
            <span>{d.nombre}</span>
            <span class="num">{clp(d.valor)}</span>
          </div>
          <Progress thin value={total ? (d.valor / total) * 100 : 0} color="var(--blue)" label={`${d.nombre}: ${clp(d.valor)}`} />
        </div>
      ))}
    </div>
  );
}

// Línea de tendencia (ahorro acumulado, notas, peso…).
export function Line({ data, label, fmt = clp }: { data: { etiqueta: string; valor: number }[]; label: string; fmt?: (n: number) => string }) {
  const W = 320;
  const H = 130;
  if (!data.length) return null;
  const vals = data.map((d) => d.valor);
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (lo === hi) hi = lo + 1;
  const X = (i: number) => (data.length === 1 ? W / 2 : 12 + (i * (W - 24)) / (data.length - 1));
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 16);
  const d = data.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.valor).toFixed(1)}`).join("");
  const last = data[data.length - 1];
  const alt = data.map((p) => `${p.etiqueta}: ${fmt(p.valor)}`).join(", ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}`}>
      <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--line)" stroke-dasharray="3 4" />
      <path d={d} fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      {data.map((p, i) => (
        <circle key={p.etiqueta} cx={X(i)} cy={Y(p.valor)} r="3.5" fill="var(--green)" />
      ))}
      <text x={X(data.length - 1)} y={Y(last.valor) - 10} text-anchor="end" font-size="12" font-weight="700" fill="var(--ink)">
        {fmt(last.valor)}
      </text>
      {data.map((p, i) => (
        <text key={"t" + p.etiqueta} x={X(i)} y={H + 16} text-anchor="middle" font-size="11" fill="var(--muted)">
          {p.etiqueta}
        </text>
      ))}
    </svg>
  );
}

export const colorEstado = (e: "ok" | "atencion" | "excedido") => (e === "excedido" ? "var(--red)" : e === "atencion" ? "var(--amber)" : "var(--green)");
export const textoEstado = (e: "ok" | "atencion" | "excedido") => (e === "excedido" ? "Pasado" : e === "atencion" ? "Ojo" : "Bien");
