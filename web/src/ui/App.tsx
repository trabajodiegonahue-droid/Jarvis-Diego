import { useEffect, useState } from "preact/hooks";
import { hasPin } from "../core/pin";
import { store } from "../data/store";
import { MovimientoForm, Sheet, Toast } from "./components";
import { Icon } from "./icons";
import { Dinero } from "./screens/Dinero";
import { Bienvenida, Bloqueo } from "./screens/Entrada";
import { Inicio } from "./screens/Inicio";
import { JarvisSheet } from "./screens/Jarvis";
import { Ajustes, Mas, Pronto } from "./screens/Mas";
import { kv, useApp, useRoute } from "./state";

const TABS = [
  { path: "/", nombre: "Inicio", icon: "inicio" },
  { path: "/dinero", nombre: "Dinero", icon: "dinero" },
  { path: "/metas", nombre: "Metas", icon: "metas" },
  { path: "/futbol", nombre: "Fútbol", icon: "futbol" },
  { path: "/mas", nombre: "Más", icon: "mas" },
];

// Se bloquea al abrir y al volver después de 5 minutos fuera de la app.
let hiddenAt = 0;

export function App() {
  const { prefs } = useApp();
  const route = useRoute();
  const [locked, setLocked] = useState(hasPin(kv));
  const [add, setAdd] = useState(false);
  const [jarvis, setJarvis] = useState(false);

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
        return <Pronto titulo="Metas" fase={2} texto="Aquí vas a ver tus metas con su porcentaje y fecha, y lo que te falta esta semana." />;
      case "/futbol":
        return <Pronto titulo="Fútbol" fase={3} texto="Partidos, estadísticas, pruebas y clubes, y tu preparación física." />;
      case "/mas":
        return <Mas />;
      case "/mas/ajustes":
        return <Ajustes />;
      case "/mas/estudios":
        return <Pronto titulo="Estudios" fase={2} texto="Materias, horas de estudio, pruebas y metas de puntaje." />;
      case "/mas/trabajo":
        return <Pronto titulo="Trabajo" fase={2} texto="Turnos, horas trabajadas e ingresos conectados con Dinero." />;
      case "/mas/habitos":
        return <Pronto titulo="Hábitos y bienestar" fase={5} texto="Hábitos con racha, sueño, energía, ánimo y agua." />;
      case "/mas/calendario":
        return <Pronto titulo="Calendario" fase={5} texto="Turnos, entrenamientos, partidos y estudios en una sola semana." />;
      default:
        return <Inicio onAdd={() => setAdd(true)} />;
    }
  })();
  const tab = TABS.find((t) => (t.path === "/" ? route === "/" : route.startsWith(t.path)))?.path || "/";

  return (
    <>
      {screen}
      <button class="fab plus" aria-label="Registrar un gasto o ingreso" onClick={() => setAdd(true)}>
        <Icon name="plus" size={26} />
      </button>
      <button class="fab jarvis" aria-label="Hablar con JARVIS" onClick={() => setJarvis(true)}>
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
          <MovimientoForm onDone={() => setAdd(false)} />
        </Sheet>
      )}
      {jarvis && <JarvisSheet onClose={() => setJarvis(false)} />}
      <Toast />
    </>
  );
}
