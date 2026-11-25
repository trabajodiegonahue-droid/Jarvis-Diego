// Gráficos propios en SVG: livianos, un solo estilo, con texto alternativo.
// Colores de significado fijo: verde a favor, rojo en contra, ámbar atención. Siempre con etiqueta.
import { useState } from "preact/hooks";
import { clp } from "../money/format";

export function Progress({ value, color = "var(--green)", thin, label }: { value: number; color?: string; thin?: boolean; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div class={`bar${thin ? " thin" : ""}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} style={{ background: `color-mix(in srgb, ${color} 16%, var(--line))` }}>
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

// Utilidades comunes de los gráficos (guía dataviz: marcas finas, punta redondeada y base cuadrada,
// ejes en línea fina continua, números solo donde importan, valor al tocar y tabla de datos).
const AX = "var(--line)";

// Columna con punta redondeada (4px) y base cuadrada, anclada al eje.
function columna(x: number, yTop: number, w: number, base: number) {
  const h = Math.max(0, base - yTop);
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x} ${base}V${yTop + r}Q${x} ${yTop} ${x + r} ${yTop}H${x + w - r}Q${x + w} ${yTop} ${x + w} ${yTop + r}V${base}Z`;
}

// Etiqueta de valor sobre la marca (fondo del color de la tarjeta para que se lea sobre la línea de meta).
function Valor({ x, y, texto, fuerte }: { x: number; y: number; texto: string; fuerte?: boolean }) {
  const w = texto.length * 6.4 + 10;
  const xx = Math.max(w / 2, Math.min(320 - w / 2, x));
  return (
    <g pointer-events="none">
      <rect x={xx - w / 2} y={y - 15} width={w} height={17} rx="5" fill="var(--card)" stroke={fuerte ? "var(--ink)" : "none"} stroke-width="1" />
      <text x={xx} y={y - 3} text-anchor="middle" font-size="11" font-weight={fuerte ? 700 : 600} fill="var(--ink)">
        {texto}
      </text>
    </g>
  );
}

// Tabla con los mismos datos del gráfico (para leer cada valor sin tocar nada).
function Datos({ filas, columnas }: { filas: (string | number)[][]; columnas: string[] }) {
  const [ver, setVer] = useState(false);
  return (
    <>
      <button class="ver-datos" aria-expanded={ver} onClick={() => setVer(!ver)}>
        {ver ? "Ocultar datos" : "Ver datos"}
      </button>
      {ver && (
        <table>
          <thead>
            <tr>
              {columnas.map((c, i) => (
                <th key={c} class={i ? "n" : ""} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {f.map((v, j) => (
                  <td key={j} class={j ? "n" : ""}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// Barras agrupadas: ingresos (verde) contra egresos (rojo) por mes. Tocas un mes y ves sus montos.
export function BarsIO({ data, label }: { data: { etiqueta: string; ingresos: number; egresos: number }[]; label: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const TOP = 20;
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.egresos]));
  const slot = W / Math.max(1, data.length);
  const bw = Math.min(16, (slot - 12) / 2);
  const y = (v: number) => H - (v / max) * (H - TOP);
  const alt = data.map((d) => `${d.etiqueta}: entró ${clp(d.ingresos)}, salió ${clp(d.egresos)}`).join(". ");
  const i = sel ?? data.length - 1;
  const d = data[i];
  return (
    <figure class="viz" style={{ margin: 0 }}>
      <div class="leyenda" aria-hidden="true">
        <span>
          <i style={{ background: "var(--green)" }} />
          Entra
        </span>
        <span>
          <i style={{ background: "var(--red)" }} />
          Sale
        </span>
        {d && (
          <span style={{ marginLeft: "auto", color: "var(--ink)" }}>
            {d.etiqueta}: <b class="pos">&nbsp;{clp(d.ingresos)}</b>&nbsp;/&nbsp;<b class="neg">{clp(d.egresos)}</b>
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}`}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke={AX} />
        {data.map((p, k) => {
          const x = k * slot + slot / 2;
          const activo = k === i;
          return (
            <g key={p.etiqueta} onClick={() => setSel(k)} style={{ cursor: "pointer" }}>
              <rect x={k * slot} y={0} width={slot} height={H + 22} fill="transparent" />
              {activo && <rect x={k * slot + 2} y={TOP - 6} width={slot - 4} height={H - TOP + 6} rx="6" fill="var(--card2)" />}
              <path d={columna(x - bw - 1, y(p.ingresos), bw, H)} fill="var(--green)" />
              <path d={columna(x + 1, y(p.egresos), bw, H)} fill="var(--red)" />
              <text x={x} y={H + 16} text-anchor="middle" font-size="11" font-weight={activo ? 700 : 400} fill={activo ? "var(--ink)" : "var(--muted)"}>
                {p.etiqueta}
              </text>
            </g>
          );
        })}
      </svg>
      <Datos columnas={["Mes", "Entra", "Sale"]} filas={data.map((p) => [p.etiqueta, clp(p.ingresos), clp(p.egresos)])} />
    </figure>
  );
}

// Barras horizontales: gasto por categoría (cada barra con su nombre y su valor al lado).
export function BarsH({ data, total, label, fmt = clp }: { data: { nombre: string; valor: number; color?: string }[]; total: number; label: string; fmt?: (n: number) => string }) {
  return (
    <div class="stack" role="list" aria-label={label} style={{ gap: "12px" }}>
      {data.map((d) => (
        <div role="listitem" key={d.nombre} class="stack" style={{ gap: "6px" }}>
          <div class="between" style={{ fontSize: "14px" }}>
            <span class="row" style={{ gap: "8px" }}>
              {d.color && <i aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "2px", background: d.color, display: "inline-block" }} />}
              {d.nombre}
            </span>
            <span class="num" style={{ fontWeight: 600 }}>
              {fmt(d.valor)}
            </span>
          </div>
          <Progress thin value={total ? (d.valor / total) * 100 : 0} color={d.color || "var(--blue)"} label={`${d.nombre}: ${fmt(d.valor)}`} />
        </div>
      ))}
    </div>
  );
}

// Línea de tendencia (ahorro acumulado, notas, peso…). Se rotula el último valor; tocas y ves cualquier punto.
// cero: el eje parte en 0 (plata); sin cero se ajusta a los valores (notas, puntajes, peso).
export function Line({ data, label, fmt = clp, cero = true }: { data: { etiqueta: string; valor: number }[]; label: string; fmt?: (n: number) => string; cero?: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
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
  const X = (i: number) => (data.length === 1 ? W / 2 : 16 + (i * (W - 32)) / (data.length - 1));
  const Y = (v: number) => 24 + (1 - (v - lo) / (hi - lo)) * (H - 32);
  const linea = data.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.valor).toFixed(1)}`).join("");
  const base = cero ? Y(0) : H;
  const area = `${linea}L${X(data.length - 1).toFixed(1)} ${base}L${X(0).toFixed(1)} ${base}Z`;
  const i = sel ?? data.length - 1;
  const p = data[i];
  const alt = data.map((q) => `${q.etiqueta}: ${fmt(q.valor)}`).join(", ");
  // Etiquetas del eje: si son muchas, solo algunas para que no se pisen.
  const paso = Math.ceil(data.length / 7);
  const elegir = (e: { clientX: number; currentTarget: SVGSVGElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    data.forEach((_, k) => Math.abs(X(k) - x) < Math.abs(X(best) - x) && (best = k));
    setSel(best);
  };
  return (
    <figure class="viz" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}`} onClick={elegir} style={{ cursor: "crosshair" }}>
        <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke={AX} />
        <path d={area} fill="var(--green)" fill-opacity="0.1" />
        <path d={linea} fill="none" stroke="var(--green)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <line x1={X(i)} x2={X(i)} y1={16} y2={base} stroke="var(--muted)" stroke-width="1" opacity="0.5" />
        <circle cx={X(i)} cy={Y(p.valor)} r="5" fill="var(--green)" stroke="var(--card)" stroke-width="2" />
        <Valor x={X(i)} y={Y(p.valor) - 8} texto={fmt(p.valor)} fuerte />
        {data.map((q, k) =>
          k % paso === 0 || k === data.length - 1 ? (
            <text key={"t" + q.etiqueta + k} x={X(k)} y={H + 16} text-anchor={k === 0 && data.length > 1 ? "start" : k === data.length - 1 && data.length > 1 ? "end" : "middle"} font-size="11" font-weight={k === i ? 700 : 400} fill={k === i ? "var(--ink)" : "var(--muted)"}>
              {q.etiqueta}
            </text>
          ) : null,
        )}
      </svg>
      <Datos columnas={["", label.split(".")[0]]} filas={data.map((q) => [q.etiqueta, fmt(q.valor)])} />
    </figure>
  );
}

export const colorEstado = (e: "ok" | "atencion" | "excedido") => (e === "excedido" ? "var(--red)" : e === "atencion" ? "var(--amber)" : "var(--green)");
export const textoEstado = (e: "ok" | "atencion" | "excedido") => (e === "excedido" ? "Pasado" : e === "atencion" ? "Ojo" : "Bien");

// Barras verticales (horas por mes, horas por semana), con una línea de meta opcional.
// Se rotula el valor más alto y el último; tocas una barra y ves el suyo.
export function Bars({ data, label, fmt = (n: number) => String(Math.round(n)), meta, color = "var(--blue)" }: { data: { etiqueta: string; valor: number }[]; label: string; fmt?: (n: number) => string; meta?: number; color?: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320;
  const H = 130;
  const TOP = 20;
  const max = Math.max(1, meta || 0, ...data.map((d) => d.valor));
  const slot = W / Math.max(1, data.length);
  const bw = Math.min(24, slot - 6);
  const y = (v: number) => H - (v / max) * (H - TOP);
  const alt = data.map((d) => `${d.etiqueta}: ${fmt(d.valor)}`).join(", ");
  const imax = data.reduce((b, d, k) => (d.valor > data[b].valor ? k : b), 0);
  const ultimo = data.length - 1;
  const rotular = new Set(sel != null ? [sel] : [imax, ultimo]);
  const paso = Math.ceil(data.length / 8);
  return (
    <figure class="viz" style={{ margin: 0 }}>
      {meta ? (
        <div class="leyenda" aria-hidden="true">
          <span>
            <i style={{ background: color }} />
            Bajo la meta
          </span>
          <span>
            <i style={{ background: "var(--green)" }} />
            Meta cumplida
          </span>
          <span>
            <i style={{ height: "2px", width: "14px", background: "var(--gold)" }} />
            Meta {fmt(meta)}
          </span>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${alt}${meta ? `. Meta: ${fmt(meta)}` : ""}`}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke={AX} />
        {meta ? <line x1="0" x2={W} y1={y(meta)} y2={y(meta)} stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="5 4" /> : null}
        {data.map((d, k) => {
          const x = k * slot + slot / 2;
          return (
            <g key={d.etiqueta + k} onClick={() => setSel(sel === k ? null : k)} style={{ cursor: "pointer" }}>
              <rect x={k * slot} y={0} width={slot} height={H + 22} fill="transparent" />
              <path d={columna(x - bw / 2, y(d.valor), bw, H)} fill={meta && d.valor >= meta ? "var(--green)" : color} opacity={sel != null && sel !== k ? 0.45 : 1} />
              {(k % paso === 0 || k === ultimo || k === sel) && (
                <text x={x} y={H + 16} text-anchor="middle" font-size="11" font-weight={k === sel ? 700 : 400} fill={k === sel ? "var(--ink)" : "var(--muted)"}>
                  {d.etiqueta}
                </text>
              )}
            </g>
          );
        })}
        {[...rotular].filter((k) => data[k] && data[k].valor > 0).map((k) => (
          <Valor key={"v" + k} x={k * slot + slot / 2} y={y(data[k].valor) - 3} texto={fmt(data[k].valor)} fuerte={k === sel} />
        ))}
      </svg>
      <Datos columnas={["", label]} filas={data.map((d) => [d.etiqueta, fmt(d.valor)])} />
    </figure>
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
      <polygon points={poly} fill="var(--green)" fill-opacity="0.12" stroke="var(--green)" stroke-width="2" stroke-linejoin="round" />
      {data.map((d, i) => {
        const [x, y] = pt(i, d.valor ?? 0);
        return d.valor == null ? null : <circle key={i} cx={x} cy={y} r="4.5" fill="var(--green)" stroke="var(--card)" stroke-width="2" />;
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

// Barras apiladas (por ejemplo, sesiones por tipo), con una marca de lo planificado. Tocas una barra y ves el detalle.
export function BarsApiladas({ data, series, label, plan }: { data: ({ etiqueta: string } & Record<string, number | string>)[]; series: { k: string; nombre: string; color: string }[]; label: string; plan?: number[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320;
  const H = 130;
  const TOP = 18;
  const total = (d: Record<string, number | string>) => series.reduce((t, s) => t + (Number(d[s.k]) || 0), 0);
  const max = Math.max(1, ...data.map(total), ...(plan || []));
  const slot = W / Math.max(1, data.length);
  const bw = Math.min(26, slot - 6);
  const y = (v: number) => H - (v / max) * (H - TOP);
  const usadas = series.filter((s) => data.some((d) => Number(d[s.k]) > 0));
  const paso = Math.ceil(data.length / 8);
  const d = sel != null ? data[sel] : null;
  return (
    <figure class="viz" style={{ margin: 0 }}>
      <div class="leyenda" aria-hidden="true">
        {usadas.map((s) => (
          <span key={s.k}>
            <i style={{ background: s.color }} />
            {s.nombre}
          </span>
        ))}
        {plan && (
          <span>
            <i style={{ height: "2px", width: "14px", background: "var(--muted)" }} />
            Planificadas
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}. ${data.map((x, k) => `${x.etiqueta}: ${total(x)}${plan ? ` de ${plan[k]}` : ""}`).join(", ")}`}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke={AX} />
        {data.map((x, k) => {
          const cx = k * slot + slot / 2;
          let acum = 0;
          return (
            <g key={x.etiqueta + k} onClick={() => setSel(sel === k ? null : k)} style={{ cursor: "pointer" }} opacity={sel != null && sel !== k ? 0.45 : 1}>
              <rect x={k * slot} y={0} width={slot} height={H + 22} fill="transparent" />
              {series.map((s) => {
                const v = Number(x[s.k]) || 0;
                if (!v) return null;
                const y1 = y(acum + v);
                const h = y(acum) - y1;
                acum += v;
                return <rect key={s.k} x={cx - bw / 2} y={y1 + 0.5} width={bw} height={Math.max(0, h - 1)} rx="2" fill={s.color} />;
              })}
              {plan && plan[k] > 0 && <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(plan[k])} y2={y(plan[k])} stroke="var(--muted)" stroke-width="2" />}
              {(k % paso === 0 || k === data.length - 1 || k === sel) && (
                <text x={cx} y={H + 16} text-anchor="middle" font-size="11" fill={k === sel ? "var(--ink)" : "var(--muted)"}>
                  {x.etiqueta}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {d && (
        <span class="small" style={{ display: "block" }}>
          {d.etiqueta}: {usadas.map((s) => `${s.nombre} ${Number(d[s.k]) || 0}`).join(" · ")}
          {plan ? ` · ${total(d)} de ${plan[sel!]} planificadas` : ""}
        </span>
      )}
      <Datos columnas={["", ...usadas.map((s) => s.nombre)]} filas={data.map((x) => [x.etiqueta, ...usadas.map((s) => String(Number(x[s.k]) || 0))])} />
    </figure>
  );
}

// Calendario tipo GitHub: un cuadrito por día, más intenso cuanto más entrenaste. Semanas en columnas, de lunes a domingo.
export function Heatmap({ dias, label, color = "var(--green)", hoy }: { dias: { fecha: string; n: number }[]; label: string; color?: string; hoy: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const cols = Math.ceil(dias.length / 7);
  const C = 14;
  const G = 3;
  const W = cols * (C + G);
  const H = 7 * (C + G);
  const max = Math.max(1, ...dias.map((d) => d.n));
  const s = sel ? dias.find((d) => d.fecha === sel) : null;
  return (
    <figure class="viz" style={{ margin: 0 }}>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W + 16} ${H}`} width={Math.max(W + 16, 120)} height={H} role="img" aria-label={`${label}: ${dias.filter((d) => d.n).length} días entrenados de ${dias.filter((d) => d.fecha <= hoy).length}`}>
          {["L", "", "M", "", "V", "", "D"].map((l, i) => (
            <text key={i} x="0" y={i * (C + G) + C - 3} font-size="9" fill="var(--muted)">
              {l}
            </text>
          ))}
          {dias.map((d, k) => {
            const col = Math.floor(k / 7);
            const row = k % 7;
            const futuro = d.fecha > hoy;
            return (
              <rect
                key={d.fecha}
                x={16 + col * (C + G)}
                y={row * (C + G)}
                width={C}
                height={C}
                rx="3"
                fill={futuro ? "transparent" : d.n ? color : "var(--card2)"}
                opacity={futuro ? 1 : d.n ? 0.4 + 0.6 * (d.n / max) : 1}
                stroke={d.fecha === hoy ? "var(--ink)" : futuro ? "var(--line)" : "none"}
                stroke-width="1"
                onClick={() => setSel(d.fecha)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>
      </div>
      {s && (
        <span class="small">
          {Number(s.fecha.slice(8))}/{Number(s.fecha.slice(5, 7))}: {s.n ? `${s.n} ${s.n === 1 ? "sesión" : "sesiones"}` : "sin entreno"}
        </span>
      )}
    </figure>
  );
}
