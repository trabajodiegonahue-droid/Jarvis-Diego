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
export function BarsH({ data, total, label, fmt = clp }: { data: { nombre: string; valor: number; color?: string }[]; total: number; label: string; fmt?: (n: number) => string }) {
  return (
    <div class="stack" role="list" aria-label={label}>
      {data.map((d) => (
        <div role="listitem" key={d.nombre} class="stack" style={{ gap: "4px" }}>
          <div class="between" style={{ fontSize: "14px" }}>
            <span>{d.nombre}</span>
            <span class="num">{fmt(d.valor)}</span>
          </div>
          <Progress thin value={total ? (d.valor / total) * 100 : 0} color={d.color || "var(--blue)"} label={`${d.nombre}: ${fmt(d.valor)}`} />
        </div>
      ))}
    </div>
  );
}

// Línea de tendencia (ahorro acumulado, notas, peso…).
// cero: el eje parte en 0 (plata); sin cero se ajusta a los valores (notas, puntajes, peso).
export function Line({ data, label, fmt = clp, cero = true }: { data: { etiqueta: string; valor: number }[]; label: string; fmt?: (n: number) => string; cero?: boolean }) {
  const W = 320;
  const H = 130;
  if (!data.length) return null;
  const vals = data.map((d) => d.valor);
  let lo = cero ? Math.min(0, ...vals) : Math.min(...vals);
  let hi = cero ? Math.max(0, ...vals) : Math.max(...vals);
  if (!cero) {
    const pad = Math.max((hi - lo) * 0.25, Math.abs(hi) * 0.05, 1);
    lo -= pad;
    hi += pad;
  }
  if (lo === hi) hi = lo + 1;
  const X = (i: number) => (data.length === 1 ? W / 2 : 24 + (i * (W - 48)) / (data.length - 1));
  const Y = (v: number) => 22 + (1 - (v - lo) / (hi - lo)) * (H - 30);
  const d = data.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.valor).toFixed(1)}`).join("");
  const last = data[data.length - 1];
  const alt = data.map((p) => `${p.etiqueta}: ${fmt(p.valor)}`).join(", ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}`}>
      {cero && <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--line)" stroke-dasharray="3 4" />}
      <path d={d} fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      {data.map((p, i) => (
        <circle key={p.etiqueta} cx={X(i)} cy={Y(p.valor)} r="3.5" fill="var(--green)" />
      ))}
      <text x={Math.min(W - 2, X(data.length - 1) + 6)} y={Y(last.valor) - 10} text-anchor="end" font-size="12" font-weight="700" fill="var(--ink)">
        {fmt(last.valor)}
      </text>
      {data.map((p, i) => (
        <text key={"t" + p.etiqueta + i} x={X(i)} y={H + 16} text-anchor="middle" font-size="11" fill="var(--muted)">
          {p.etiqueta}
        </text>
      ))}
    </svg>
  );
}

export const colorEstado = (e: "ok" | "atencion" | "excedido") => (e === "excedido" ? "var(--red)" : e === "atencion" ? "var(--amber)" : "var(--green)");
export const textoEstado = (e: "ok" | "atencion" | "excedido") => (e === "excedido" ? "Pasado" : e === "atencion" ? "Ojo" : "Bien");

// Barras verticales simples (horas por mes, horas por semana), con una línea de meta opcional.
export function Bars({ data, label, fmt = (n: number) => String(Math.round(n)), meta, color = "var(--blue)" }: { data: { etiqueta: string; valor: number }[]; label: string; fmt?: (n: number) => string; meta?: number; color?: string }) {
  const W = 320;
  const H = 130;
  const max = Math.max(1, meta || 0, ...data.map((d) => d.valor));
  const slot = W / Math.max(1, data.length);
  const bw = Math.min(26, slot * 0.55);
  const y = (v: number) => H - (v / max) * (H - 14);
  const alt = data.map((d) => `${d.etiqueta}: ${fmt(d.valor)}`).join(", ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}${meta ? `. Meta: ${fmt(meta)}` : ""}`}>
      <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
      {meta ? <line x1="0" x2={W} y1={y(meta)} y2={y(meta)} stroke="var(--gold)" stroke-dasharray="4 4" /> : null}
      {data.map((d, i) => {
        const x = i * slot + slot / 2;
        return (
          <g key={d.etiqueta + i}>
            <rect x={x - bw / 2} y={y(d.valor)} width={bw} height={H - y(d.valor)} rx="4" fill={meta && d.valor >= meta ? "var(--green)" : color} />
            {d.valor > 0 && (
              <text x={x} y={meta && Math.abs(y(d.valor) - y(meta)) < 14 && H - y(d.valor) > 18 ? y(d.valor) + 13 : y(d.valor) - 4} text-anchor="middle" font-size="10" fill={meta && Math.abs(y(d.valor) - y(meta)) < 14 && H - y(d.valor) > 18 ? "var(--bg)" : "var(--muted)"}>
                {fmt(d.valor)}
              </text>
            )}
            <text x={x} y={H + 16} text-anchor="middle" font-size="11" fill="var(--muted)">
              {d.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Rueda de la vida: un radar con el equilibrio de cada área (0 a 100). Áreas sin datos quedan en gris.
export function Rueda({ data, label }: { data: { nombre: string; valor: number | null }[]; label: string }) {
  const n = data.length;
  if (n < 3) return null;
  const S = 300;
  const c = S / 2;
  const R = 92;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(ang) * R * (v / 100), c + Math.sin(ang) * R * (v / 100)];
  };
  const poly = data.map((d, i) => pt(i, d.valor ?? 0).join(",")).join(" ");
  const alt = data.map((d) => `${d.nombre}: ${d.valor == null ? "sin datos" : `${d.valor} de 100`}`).join(", ");
  return (
    <svg viewBox={`-70 -6 ${S + 140} ${S + 16}`} width="100%" style={{ maxWidth: "400px", alignSelf: "center" }} role="img" aria-label={`${label}. ${alt}`}>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={data.map((_, i) => pt(i, v).join(",")).join(" ")} fill="none" stroke="var(--line)" stroke-width={v === 100 ? 1.5 : 1} />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" />;
      })}
      <polygon points={poly} fill="var(--green)" fill-opacity="0.22" stroke="var(--green)" stroke-width="2" stroke-linejoin="round" />
      {data.map((d, i) => {
        const [x, y] = pt(i, d.valor ?? 0);
        return d.valor == null ? null : <circle key={i} cx={x} cy={y} r="3.5" fill="var(--green)" />;
      })}
      {data.map((d, i) => {
        const [x, y] = pt(i, 128);
        const anchor = Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end";
        return (
          <text key={d.nombre} x={x} y={y + 4} text-anchor={anchor} font-size="12" fill={d.valor == null ? "var(--muted)" : "var(--ink)"} font-weight="600">
            {d.nombre}
            <tspan x={x} dy="14" font-size="11" font-weight="400" fill="var(--muted)">
              {d.valor == null ? "—" : d.valor}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
