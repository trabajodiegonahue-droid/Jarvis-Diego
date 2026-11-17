import { render } from "preact";
import "./ui/theme.css";
import { store } from "./data/store";
import { App } from "./ui/App";
import { applyTheme } from "./ui/state";

applyTheme();
const root = document.getElementById("app")!;
render(<App />, root);

store
  .load()
  .catch(() => {
    root.innerHTML = '<main class="page"><div class="card"><h2>No pude abrir tus datos</h2><p class="small">Puede que el navegador esté en modo privado o sin espacio. Cierra la app y ábrela de nuevo.</p></div></main>';
  });

// Abrir sin internet (fuera de la vista previa de Claude).
if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
