import { useEffect, useState } from "preact/hooks";
import { hasPin } from "../core/pin";
import { store } from "../data/store";
import { Seguro, Sheet, Toast } from "./components";
import { Icon } from "./icons";
import { Dinero } from "./screens/Dinero";
import { Bienvenida, Bloqueo } from "./screens/Entrada";
import { Inicio } from "./screens/Inicio";
import { alChat, JarvisSheet } from "./screens/Jarvis";
import { Cardio } from "./screens/Cardio";
import { MiDia } from "./screens/MiDia";
import { Estudio } from "./screens/Estudio";
import { Comida } from "./screens/Comida";
import { Mascota } from "./screens/Mascota";
import { revisarBuzon } from "../jarvis/buzon";
import { assistant, settings } from "../jarvis/instance";
import { chileNow } from "../core/time";
import { Ajustes, Mas } from "./screens/Mas";
import { Metas } from "./screens/Metas";
import { Trabajo } from "./screens/Trabajo";
import { Registrar } from "./screens/Registrar";
import { Futbol } from "./screens/Futbol";
import { Habitos } from "./screens/Habitos";
import { Calendario } from "./screens/Calendario";
import { Tiempo } from "./screens/Tiempo";
import { Recordatorios } from "./screens/Recordatorios";
import { Compras } from "./screens/Compras";
import { Areas } from "./screens/Areas";
import { cerrarAviso, getSonando, iniciarAvisos, onSonando, posponer } from "../jarvis/avisosApp";
import { getPrefs as getPrefsApp, go, kv, toast, useApp, useRoute } from "./state";

const TABS = [
  { path: "/", nombre: "Hoy", icon: "inicio" },
  { path: "/futbol", nombre: "Fútbol", icon: "futbol" },
  { path: "/mas/estudios", nombre: "Estudio", icon: "libro" },
  { path: "/mas/comida", nombre: "Comida", icon: "estrella" },
  { path: "/mas", nombre: "Más", icon: "mas" },
];

// Se bloquea al abrir y al volver después de 5 minutos fuera de la app.
let hiddenAt = 0;

export function App() {
  const { prefs } = useApp();
  const route = useRoute();
  const [locked, setLocked] = useState(hasPin(kv));
  const [add, setAdd] = useState(false);
  const [jarvis, setJarvis] = useState<false | { borrador?: string; enviar?: boolean }>(false);
  // Botones de la app (por ejemplo en el Inicio) abren JARVIS con una frase lista o ya enviada.
  useEffect(() => {
    const f = (e: Event) => setJarvis({ ...((e as CustomEvent).detail || {}) });
    addEventListener("abrir-jarvis", f);
    return () => removeEventListener("abrir-jarvis", f);
  }, []);
  const listo = store.ready && !locked && prefs.onboarded;

  // "Oye Siri, Jarvis": el atajo puede abrir la app con lo dictado (#/jarvis?q=...),
  // o dejarlo en el buzón del intermediario, que se revisa al abrir y al volver a la app.
  useEffect(() => {
    if (!listo) return;
    const abrirDesdeEnlace = () => {
      const m = location.hash.match(/^#\/jarvis(?:\?(.*))?$/);
      if (!m) return;
      const q = new URLSearchParams(m[1] || "").get("q")?.trim();
      history.replaceState(null, "", location.pathname + location.search + "#/");
      dispatchEvent(new HashChangeEvent("hashchange"));
      // El texto de un enlace no se ejecuta solo: queda escrito para que tú lo revises y lo envíes.
      setJarvis(q ? { borrador: q.slice(0, 300) } : {});
    };
    const buzon = async () => {
      const r = await revisarBuzon(settings, assistant);
      if (!r.length) return;
      alChat(...r.flatMap((x) => [{ who: "u" as const, text: `Desde Siri: ${x.texto}` }, { who: "a" as const, text: x.respuesta, undo: x.undo, guardado: x.guardado }]));
      // Se abre JARVIS para que veas qué llegó desde Siri, qué se guardó y dónde (con Deshacer).
      toast(r.length === 1 ? "Llegó 1 cosa desde Siri." : `Llegaron ${r.length} cosas desde Siri.`);
      setJarvis({});
    };
    abrirDesdeEnlace();
    void buzon();
    iniciarAvisos();
    // Metas del bloque (una vez, si ya usas Mi Día).
    if (getPrefsApp().miDia && !kv.get("metasPlan", false)) void import("../jarvis/metasPlan").then(({ crearMetasPlan }) => crearMetasPlan(chileNow().date).then(() => kv.set("metasPlan", true)));
    // Respaldo automático y cifrado (si lo activaste), una vez al día.
    void import("../data/nube").then(({ respaldoDiario }) =>
      respaldoDiario(settings.mode === "worker" && settings.workerUrl && settings.workerToken ? { url: settings.workerUrl, token: settings.workerToken } : null, store.data, kv, chileNow().date),
    );
    const vis = () => !document.hidden && void buzon();
    addEventListener("hashchange", abrirDesdeEnlace);
    document.addEventListener("visibilitychange", vis);
    return () => {
      removeEventListener("hashchange", abrirDesdeEnlace);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [listo]);

  useEffect(() => {
    const f = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000 && hasPin(kv)) setLocked(true);
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  if (!store.ready) return <main class="page" aria-busy="true" />;
  if (locked) return <Bloqueo onOpen={() => setLocked(false)} />;
  if (!prefs.onboarded) return <Bienvenida />;

  const screen = (() => {
    switch (route) {
      case "/":
        return <Inicio onAdd={() => setAdd(true)} />;
      case "/dinero":
        return <Dinero onAdd={() => setAdd(true)} />;
      case "/metas":
        return <Metas />;
      case "/futbol":
        return <Futbol />;
      case "/mas":
        return <Mas />;
      case "/mas/ajustes":
        return <Ajustes />;
      case "/mas/estudios":
        return <Estudio />;
      case "/mas/trabajo":
        return <Trabajo />;
      case "/mas/habitos":
        return <Habitos />;
      case "/mas/calendario":
        return <Calendario />;
      case "/mas/tiempo":
        return <Tiempo />;
      case "/mas/recordatorios":
        return <Recordatorios />;
      case "/mas/compras":
        return <Compras />;
      case "/mas/comida":
        return <Comida />;
      case "/mas/midia":
        return <MiDia />;
      case "/mas/cardio":
        return <Cardio />;
      case "/mas/mascota":
        return <Mascota />;
      case "/areas":
        return <Areas />;
      default:
        return <Inicio onAdd={() => setAdd(true)} />;
    }
  })();
  // La pestaña activa es la de ruta más larga que calce (así /mas/estudios es Estudio y no Más).
  const tab = [...TABS].sort((a, b) => b.path.length - a.path.length).find((t) => (t.path === "/" ? route === "/" : route.startsWith(t.path)))?.path || "/";

  return (
    <>
      <Seguro key={route} pagina onVolver={() => go("/")}>
        {screen}
      </Seguro>
      {/* Registrar a mano: desde Dinero. Lo normal es contárselo a JARVIS. */}
      <button class="fab jarvis" aria-label="Hablar con JARVIS" onClick={() => setJarvis({})}>
        <Icon name="mic" size={24} />
      </button>
      <nav class="tabs" aria-label="Secciones">
        {TABS.map((t) => (
          <a key={t.path} href={`#${t.path}`} class={tab === t.path ? "on" : ""} aria-current={tab === t.path ? "page" : undefined}>
            <Icon name={t.icon} />
            {t.nombre}
          </a>
        ))}
      </nav>
      {add && (
        <Sheet title="Registrar" onClose={() => setAdd(false)}>
          <Registrar onDone={() => setAdd(false)} />
        </Sheet>
      )}
      {jarvis && <JarvisSheet borrador={jarvis.borrador} enviar={jarvis.enviar} onClose={() => setJarvis(false)} />}
      <AvisoEnPantalla />
      <Toast />
    </>
  );
}

// Cuando suena un recordatorio con la app abierta: aparece arriba, con "Listo" y "Posponer".
function AvisoEnPantalla() {
  const [, redraw] = useState(0);
  useEffect(() => onSonando(() => redraw((n) => n + 1)), []);
  const s = getSonando()[0];
  if (!s) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Recordatorio" class="card" style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 10px)", left: "12px", right: "12px", zIndex: 60, maxWidth: "560px", margin: "0 auto", borderColor: "var(--gold)", boxShadow: "0 12px 40px rgba(0,0,0,.45)", gap: "10px" }}>
      <span class="lbl" style={{ color: "var(--gold)" }}>
        {s.atrasado ? "Se te pasó este recordatorio" : "Recordatorio"}
      </span>
      <strong style={{ fontSize: "18px" }}>{s.r.texto}</strong>
      <div class="row" style={{ gap: "8px", flexWrap: "wrap" }}>
        <button class="btn sm main" onClick={() => cerrarAviso(s.r.id)}>
          Listo
        </button>
        <button class="btn sm" onClick={() => posponer(s, 10)}>
          En 10 min
        </button>
        <button class="btn sm" onClick={() => posponer(s, 60)}>
          En 1 hora
        </button>
      </div>
    </div>
  );
}
