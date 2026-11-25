// Ilustraciones de ejercicios dibujadas en código: una persona con camiseta verde y short azul haciendo el movimiento.
import type { Pose } from "../plan/sesiones";

type P = [number, number];
interface Cuerpo {
  cabeza: P;
  cuello: P;
  cadera: P;
  rodI: P; pieI: P; rodD: P; pieD: P;
  codoI: P; manoI: P; codoD: P; manoD: P;
  extra?: "balon-pie" | "balon-mano" | "mancuerna" | "cajon" | "pared" | "banco" | "barra" | "conos" | "flecha";
  balon?: P;
}
const C = (o: Cuerpo) => o;
// De pie, mirando a la derecha (base para varias poses).
const PIE: Cuerpo = { cabeza: [50, 14], cuello: [50, 22], cadera: [50, 52], rodI: [47, 70], pieI: [46, 88], rodD: [53, 70], pieD: [54, 88], codoI: [44, 37], manoI: [43, 51], codoD: [56, 37], manoD: [57, 51] };

const POSES: Record<Pose, Cuerpo> = {
  trote: C({ cabeza: [52, 14], cuello: [51, 22], cadera: [48, 50], rodI: [40, 64], pieI: [32, 78], rodD: [58, 63], pieD: [56, 82], codoI: [42, 34], manoI: [46, 44], codoD: [58, 32], manoD: [62, 24] }),
  sprint: C({ cabeza: [62, 18], cuello: [58, 25], cadera: [46, 50], rodI: [34, 60], pieI: [24, 74], rodD: [60, 58], pieD: [58, 80], codoI: [48, 33], manoI: [44, 44], codoD: [66, 34], manoD: [72, 24], extra: "flecha" }),
  plancha: C({ cabeza: [80, 60], cuello: [74, 63], cadera: [46, 68], rodI: [32, 72], pieI: [18, 76], rodD: [32, 73], pieD: [18, 77], codoI: [72, 76], manoI: [80, 77], codoD: [73, 76], manoD: [81, 77] }),
  "plancha-lateral": C({ cabeza: [78, 50], cuello: [72, 54], cadera: [46, 64], rodI: [32, 70], pieI: [18, 76], rodD: [32, 70], pieD: [18, 76], codoI: [72, 74], manoI: [80, 76], codoD: [68, 46], manoD: [64, 36] }),
  equilibrio: C({ ...PIE, rodD: [58, 64], pieD: [52, 72], codoI: [38, 34], manoI: [30, 34], codoD: [62, 34], manoD: [70, 34] }),
  sentadilla: C({ cabeza: [56, 30], cuello: [54, 37], cadera: [40, 62], rodI: [58, 66], pieI: [52, 88], rodD: [60, 67], pieD: [54, 88], codoI: [62, 44], manoI: [72, 44], codoD: [63, 45], manoD: [73, 45] }),
  salto: C({ cabeza: [50, 8], cuello: [50, 16], cadera: [50, 44], rodI: [44, 58], pieI: [46, 72], rodD: [56, 58], pieD: [54, 72], codoI: [42, 10], manoI: [40, 2], codoD: [58, 10], manoD: [60, 2], extra: "cajon" }),
  bulgara: C({ cabeza: [50, 22], cuello: [50, 30], cadera: [48, 58], rodI: [36, 74], pieI: [22, 64], rodD: [60, 66], pieD: [60, 88], codoI: [46, 44], manoI: [46, 58], codoD: [52, 44], manoD: [52, 58], extra: "banco" }),
  bisagra: C({ cabeza: [74, 34], cuello: [67, 38], cadera: [46, 50], rodI: [48, 70], pieI: [48, 88], rodD: [30, 46], pieD: [16, 42], codoI: [66, 52], manoI: [66, 64], codoD: [67, 52], manoD: [67, 64], extra: "mancuerna" }),
  stepup: C({ cabeza: [52, 10], cuello: [52, 18], cadera: [52, 46], rodI: [54, 62], pieI: [56, 74], rodD: [64, 40], pieD: [62, 56], codoI: [46, 32], manoI: [44, 44], codoD: [58, 32], manoD: [62, 22], extra: "cajon" }),
  puente: C({ cabeza: [22, 72], cuello: [28, 70], cadera: [52, 58], rodI: [66, 56], pieI: [72, 80], rodD: [62, 44], pieD: [76, 36], codoI: [30, 78], manoI: [40, 80], codoD: [31, 78], manoD: [41, 80], extra: "banco" }),
  nordico: C({ cabeza: [66, 26], cuello: [62, 32], cadera: [46, 58], rodI: [38, 80], pieI: [16, 82], rodD: [39, 80], pieD: [17, 82], codoI: [64, 44], manoI: [70, 50], codoD: [65, 44], manoD: [71, 50] }),
  copenhague: C({ cabeza: [20, 56], cuello: [26, 58], cadera: [50, 62], rodI: [64, 66], pieI: [80, 58], rodD: [62, 74], pieD: [70, 84], codoI: [26, 72], manoI: [20, 74], codoD: [36, 50], manoD: [40, 42], extra: "banco" }),
  gemelo: C({ ...PIE, cabeza: [50, 10], cuello: [50, 18], cadera: [50, 48], rodI: [47, 66], pieI: [46, 82], rodD: [58, 62], pieD: [56, 72], extra: "cajon" }),
  flexion: C({ cabeza: [80, 62], cuello: [74, 63], cadera: [46, 56], rodI: [32, 52], pieI: [18, 48], rodD: [32, 53], pieD: [18, 49], codoI: [70, 74], manoI: [76, 80], codoD: [71, 74], manoD: [77, 80], extra: "cajon" }),
  remo: C({ cabeza: [72, 38], cuello: [66, 42], cadera: [44, 46], rodI: [44, 66], pieI: [44, 88], rodD: [58, 62], pieD: [60, 88], codoI: [74, 58], manoI: [76, 66], codoD: [58, 34], manoD: [60, 52], extra: "mancuerna" }),
  "press-suelo": C({ cabeza: [22, 78], cuello: [28, 78], cadera: [54, 78], rodI: [64, 64], pieI: [74, 82], rodD: [65, 64], pieD: [75, 82], codoI: [34, 86], manoI: [36, 62], codoD: [38, 86], manoD: [40, 62], extra: "mancuerna" }),
  "press-hombro": C({ ...PIE, codoI: [40, 22], manoI: [42, 6], codoD: [60, 22], manoD: [58, 6], extra: "mancuerna" }),
  dominada: C({ cabeza: [50, 22], cuello: [50, 28], cadera: [50, 56], rodI: [46, 70], pieI: [50, 82], rodD: [54, 70], pieD: [56, 82], codoI: [38, 18], manoI: [38, 6], codoD: [62, 18], manoD: [62, 6], extra: "barra" }),
  "core-hombros": C({ cabeza: [80, 56], cuello: [74, 58], cadera: [46, 62], rodI: [32, 68], pieI: [18, 76], rodD: [32, 69], pieD: [18, 77], codoI: [74, 70], manoI: [76, 80], codoD: [76, 62], manoD: [72, 58] }),
  curl: C({ ...PIE, codoI: [46, 38], manoI: [52, 28], codoD: [54, 38], manoD: [60, 50], extra: "mancuerna" }),
  skipping: C({ cabeza: [52, 10], cuello: [52, 18], cadera: [50, 46], rodI: [64, 46], pieI: [62, 60], rodD: [50, 64], pieD: [50, 82], codoI: [44, 30], manoI: [48, 22], codoD: [60, 30], manoD: [62, 42] }),
  pogo: C({ ...PIE, cabeza: [50, 8], cuello: [50, 16], cadera: [50, 46], rodI: [48, 64], pieI: [47, 80], rodD: [52, 64], pieD: [53, 80], codoI: [42, 30], manoI: [42, 42], codoD: [58, 30], manoD: [58, 42] }),
  "salto-largo": C({ cabeza: [64, 22], cuello: [60, 28], cadera: [46, 50], rodI: [58, 58], pieI: [66, 70], rodD: [60, 60], pieD: [68, 72], codoI: [70, 30], manoI: [80, 24], codoD: [71, 31], manoD: [81, 25], extra: "flecha" }),
  lateral: C({ cabeza: [54, 22], cuello: [52, 30], cadera: [48, 56], rodI: [38, 66], pieI: [30, 82], rodD: [56, 66], pieD: [60, 76], codoI: [40, 40], manoI: [34, 48], codoD: [62, 40], manoD: [68, 48], extra: "conos" }),
  conduccion: C({ ...POSE_CORRE(), extra: "balon-pie", balon: [72, 84] }),
  giro: C({ cabeza: [48, 18], cuello: [48, 26], cadera: [50, 54], rodI: [40, 68], pieI: [36, 84], rodD: [60, 68], pieD: [64, 84], codoI: [38, 38], manoI: [32, 46], codoD: [60, 36], manoD: [66, 42], extra: "balon-pie", balon: [72, 86] }),
  reaccion: C({ cabeza: [54, 24], cuello: [52, 31], cadera: [46, 56], rodI: [56, 68], pieI: [54, 86], rodD: [38, 70], pieD: [34, 86], codoI: [42, 42], manoI: [46, 52], codoD: [60, 40], manoD: [64, 50], extra: "conos" }),
  movilidad: C({ ...PIE, rodD: [62, 66], pieD: [70, 86], codoI: [40, 26], manoI: [36, 14], codoD: [60, 26], manoD: [64, 14] }),
  pared: C({ cabeza: [44, 14], cuello: [44, 22], cadera: [44, 52], rodI: [42, 70], pieI: [40, 88], rodD: [52, 68], pieD: [62, 82], codoI: [38, 36], manoI: [34, 46], codoD: [50, 36], manoD: [54, 46], extra: "pared", balon: [70, 84] }),
  tiro: C({ cabeza: [42, 14], cuello: [43, 22], cadera: [46, 52], rodI: [44, 70], pieI: [42, 88], rodD: [60, 62], pieD: [72, 70], codoI: [34, 34], manoI: [28, 42], codoD: [54, 34], manoD: [60, 40], extra: "balon-pie", balon: [80, 68] }),
  toques: C({ ...PIE, rodD: [56, 70], pieD: [62, 84], extra: "balon-pie", balon: [68, 86] }),
  "pase-largo": C({ cabeza: [40, 14], cuello: [41, 22], cadera: [46, 52], rodI: [44, 70], pieI: [42, 88], rodD: [62, 60], pieD: [74, 62], codoI: [30, 32], manoI: [22, 36], codoD: [52, 32], manoD: [58, 26], extra: "balon-pie", balon: [84, 54] }),
  "dominadas-balon": C({ ...PIE, rodI: [52, 66], pieI: [58, 76], extra: "balon-pie", balon: [62, 62] }),
  estirar: C({ cabeza: [66, 40], cuello: [60, 44], cadera: [42, 66], rodI: [62, 74], pieI: [80, 84], rodD: [36, 80], pieD: [22, 84], codoI: [70, 60], manoI: [78, 76], codoD: [70, 61], manoD: [79, 77] }),
};
function POSE_CORRE(): Cuerpo {
  return { cabeza: [54, 14], cuello: [53, 22], cadera: [48, 50], rodI: [40, 64], pieI: [32, 80], rodD: [58, 66], pieD: [62, 84], codoI: [42, 34], manoI: [46, 44], codoD: [60, 32], manoD: [64, 24] };
}

const PIEL = "#e2b48c";
const CAMISETA = "#1f9d55";
const SHORT = "#2f5fc4";
const mid = (a: P, b: P, t = 0.5): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const L = (a: P, b: P, color: string, w: number) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} stroke-width={w} stroke-linecap="round" />;

export function Figura({ pose, size = 120, label }: { pose: Pose; size?: number; label?: string }) {
  const c = POSES[pose] || PIE;
  const hombro = mid(c.cuello, c.cadera, 0.08);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label || "Ilustración del ejercicio"} class="figura">
      <line x1="4" y1="90" x2="96" y2="90" stroke="var(--line)" stroke-width="1.5" />
      {c.extra === "cajon" && <rect x="56" y="74" width="26" height="16" rx="2" fill="var(--card2)" stroke="var(--muted)" stroke-width="1" />}
      {c.extra === "banco" && <rect x="12" y="62" width="24" height="8" rx="2" fill="var(--card2)" stroke="var(--muted)" stroke-width="1" />}
      {c.extra === "pared" && <rect x="88" y="40" width="6" height="50" fill="var(--card2)" stroke="var(--muted)" stroke-width="1" />}
      {c.extra === "barra" && L([26, 6], [74, 6], "var(--muted)", 2.5)}
      {c.extra === "conos" && (
        <>
          <path d="M16 90 l4-9 l4 9z" fill="#f2a93b" />
          <path d="M78 90 l4-9 l4 9z" fill="#f2a93b" />
        </>
      )}
      {c.extra === "flecha" && <path d="M6 30 h14 m-4 -4 l4 4 l-4 4" stroke="var(--muted)" stroke-width="1.5" fill="none" />}
      {/* Piernas y short */}
      {L(c.cadera, c.rodI, PIEL, 6)}
      {L(c.rodI, c.pieI, PIEL, 5.5)}
      {L(c.cadera, c.rodD, PIEL, 6)}
      {L(c.rodD, c.pieD, PIEL, 5.5)}
      {L(c.cadera, mid(c.cadera, c.rodI, 0.55), SHORT, 9)}
      {L(c.cadera, mid(c.cadera, c.rodD, 0.55), SHORT, 9)}
      <circle cx={c.pieI[0]} cy={c.pieI[1]} r="2.6" fill="#1b1b1b" />
      <circle cx={c.pieD[0]} cy={c.pieD[1]} r="2.6" fill="#1b1b1b" />
      {/* Tronco y brazos */}
      {L(hombro, c.codoI, PIEL, 4.5)}
      {L(c.codoI, c.manoI, PIEL, 4.2)}
      {L(c.cuello, c.cadera, CAMISETA, 13)}
      {L(hombro, mid(hombro, c.codoI, 0.45), CAMISETA, 6)}
      {L(hombro, c.codoD, PIEL, 4.5)}
      {L(c.codoD, c.manoD, PIEL, 4.2)}
      {L(hombro, mid(hombro, c.codoD, 0.45), CAMISETA, 6)}
      <circle cx={c.cabeza[0]} cy={c.cabeza[1]} r="6.5" fill={PIEL} />
      <path d={`M${c.cabeza[0] - 6.5} ${c.cabeza[1] - 1} a6.5 6.5 0 0 1 13 0 q-6 -3 -13 0z`} fill="#2b2118" />
      {c.extra === "mancuerna" && (
        <>
          {L([c.manoI[0] - 4, c.manoI[1]], [c.manoI[0] + 4, c.manoI[1]], "#444", 2.5)}
          <rect x={c.manoI[0] - 6} y={c.manoI[1] - 3} width="3" height="6" fill="#333" />
          <rect x={c.manoI[0] + 3} y={c.manoI[1] - 3} width="3" height="6" fill="#333" />
        </>
      )}
      {(c.extra === "balon-pie" || c.extra === "pared" || c.balon) && c.balon && (
        <g>
          <circle cx={c.balon[0]} cy={c.balon[1]} r="4.5" fill="#fff" stroke="#222" stroke-width="0.8" />
          <path d={`M${c.balon[0]} ${c.balon[1] - 2} l1.8 1.3 -0.7 2 h-2.2 l-0.7 -2z`} fill="#222" />
        </g>
      )}
    </svg>
  );
}
