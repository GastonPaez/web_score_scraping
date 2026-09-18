/**
 * Renderiza las tablas desde los JSON estaticos de data/.
 *
 * No hay scraping en el navegador: los archivos los genera
 * scraper/scrape_promiedos.py en GitHub Actions y quedan commiteados en el
 * repo. Aca solo se leen con fetch relativo: sin API keys, sin CORS y sin
 * dependencia de ningun servicio externo en tiempo de ejecucion.
 */

/**
 * Unica fuente de verdad de las columnas. `prioridad` define el orden en que
 * se caen al achicar la pantalla: en un celular de 375px no entran diez
 * columnas, y el scroll horizontal dentro de una tabla es el peor patron
 * posible. Se muestran las 5 que respondan "como va mi equipo" y el resto
 * aparece a partir de sm/md.
 *
 *   1 = siempre visible   2 = desde sm (640px)   3 = desde md (768px)
 */
const COLUMNAS = [
  { clave: "pos",    titulo: "#",      prioridad: 1, ancho: "w-9",  alineacion: "center" },
  { clave: "equipo", titulo: "Equipo", prioridad: 1, ancho: "w-auto", alineacion: "left" },
  { clave: "pj",     titulo: "PJ",     prioridad: 1, ancho: "w-9" },
  { clave: "pg",     titulo: "G",      prioridad: 3, ancho: "w-9" },
  { clave: "pe",     titulo: "E",      prioridad: 3, ancho: "w-9" },
  { clave: "pp",     titulo: "P",      prioridad: 3, ancho: "w-9" },
  { clave: "gf",     titulo: "GF",     prioridad: 2, ancho: "w-9" },
  { clave: "gc",     titulo: "GC",     prioridad: 2, ancho: "w-9" },
  { clave: "dif",    titulo: "DIF",    prioridad: 1, ancho: "w-11", tipo: "diferencia" },
  { clave: "pts",    titulo: "PTS",    prioridad: 1, ancho: "w-11", destacada: true },
];

const VISIBILIDAD = { 1: "", 2: "hidden sm:table-cell", 3: "hidden md:table-cell" };

const contenedor = document.querySelector("#tablas");
const leyenda = document.querySelector("#leyenda");
const elementoActualizado = document.querySelector("#actualizado");
const elementoTitulo = document.querySelector("#titulo");
const elementoFase = document.querySelector("#fase");

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  // textContent, nunca innerHTML: los nombres de equipo vienen de una fuente
  // externa y no deben interpretarse como HTML.
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
};

/* ── Celdas ─────────────────────────────────────────────────────────── */

function claseCelda(columna) {
  const clases = ["px-1.5", "py-2", "whitespace-nowrap", VISIBILIDAD[columna.prioridad] || ""];
  clases.push(columna.alineacion === "left" ? "text-left" : "text-center");
  if (columna.destacada) clases.push("font-bold", "text-white", "bg-white/[0.04]");
  else clases.push("text-slate-300");
  return clases.join(" ");
}

function celdaEquipo(nombre) {
  const td = el("td", "px-1.5 py-2 text-left");
  const envoltorio = el("div", "flex items-center gap-2 min-w-0");
  envoltorio.appendChild(el("span", "truncate font-medium text-slate-50", nombre));
  td.appendChild(envoltorio);
  return td;
}

function celdaDiferencia(valor) {
  const clases = ["px-1.5", "py-2", "text-center", "tabular-nums", "font-medium"];
  clases.push(valor > 0 ? "text-acento" : valor < 0 ? "text-peligro" : "text-tenue");
  return el("td", clases.join(" "), valor > 0 ? `+${valor}` : String(valor));
}

/* ── Tabla ──────────────────────────────────────────────────────────── */

/** `filas` son objetos { celdas: [...], zona?: string }. */
function construirTabla({ titulo, subtitulo, columnas, filas }) {
  const tarjeta = el("section", "overflow-hidden rounded-xl border border-borde bg-panel shadow-lg shadow-black/30");

  const encabezado = el("div", "flex items-baseline justify-between gap-3 border-b border-borde px-4 py-3");
  encabezado.appendChild(el("h2", "font-display text-2xl font-semibold uppercase tracking-wide", titulo));
  if (subtitulo) encabezado.appendChild(el("span", "text-xs text-tenue", subtitulo));
  tarjeta.appendChild(encabezado);

  const contenedorTabla = el("div", "overflow-x-auto");
  const tabla = el("table", "w-full border-collapse text-sm tabular-nums");

  const thead = el("thead");
  const filaEncabezado = el("tr", "border-b border-borde bg-panel2/60");
  columnas.forEach((columna) => {
    const th = el("th", `${claseCelda(columna)} ${columna.ancho} font-display text-xs font-semibold uppercase tracking-wider text-tenue`);
    th.textContent = columna.titulo;
    th.scope = "col";
    filaEncabezado.appendChild(th);
  });
  thead.appendChild(filaEncabezado);
  tabla.appendChild(thead);

  const tbody = el("tbody");
  filas.forEach(({ celdas, zona }, indice) => {
    const tr = el("tr", "group border-b border-borde/50 transition-colors last:border-0 hover:bg-panel2");
    if (indice % 2) tr.classList.add("bg-white/[0.015]");
    if (zona) tr.title = zona;

    columnas.forEach((columna, i) => {
      let td;
      if (columna.clave === "equipo") td = celdaEquipo(celdas[i]);
      else if (columna.tipo === "diferencia") td = celdaDiferencia(Number(celdas[i]));
      else td = el("td", claseCelda(columna), String(celdas[i]));

      // La zona se marca con una barra de color a la izquierda de la fila:
      // es posicional y tiene leyenda, no depende solo del color (daltonismo).
      if (i === 0) {
        td.classList.add("relative", "font-semibold", "text-tenue");
        if (zona) {
          const barra = el("span", "absolute inset-y-0 left-0 w-[3px] bg-zona");
          barra.setAttribute("aria-hidden", "true");
          td.appendChild(barra);
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tabla.appendChild(tbody);
  contenedorTabla.appendChild(tabla);
  tarjeta.appendChild(contenedorTabla);
  return tarjeta;
}

/* ── Vistas ─────────────────────────────────────────────────────────── */

function vistaPosiciones(datos) {
  const paneles = datos.grupos.map((grupo) =>
    construirTabla({
      titulo: grupo.nombre,
      subtitulo: `${grupo.filas.length} equipos`,
      columnas: COLUMNAS,
      filas: grupo.filas.map((equipo) => ({
        celdas: COLUMNAS.map((c) => equipo[c.clave]),
        zona: equipo.zona,
      })),
    })
  );

  const zonas = [...new Set(datos.grupos.flatMap((g) => g.zonas || []))];
  return { paneles, zonas, titulo: "Tabla de Posiciones", fase: datos.fase };
}

function vistaPromedios(datos) {
  const columnas = [
    { clave: "pos",    titulo: "#",      prioridad: 1, ancho: "w-9", alineacion: "center" },
    { clave: "equipo", titulo: "Equipo", prioridad: 1, ancho: "w-auto", alineacion: "left" },
    ...datos.columnas.map((titulo, i) => ({
      titulo,
      // El promedio y los puntos son lo que se mira; las temporadas sueltas
      // son detalle y se ocultan en pantallas chicas.
      prioridad: i <= 1 ? 1 : i === 2 ? 2 : 3,
      ancho: "w-12",
      destacada: i === 0,
    })),
  ];

  return {
    paneles: [
      construirTabla({
        titulo: "Promedios",
        subtitulo: `${datos.filas.length} equipos`,
        columnas,
        filas: datos.filas.map((e) => ({ celdas: [e.pos, e.equipo, ...e.valores] })),
      }),
    ],
    zonas: [],
    titulo: "Tabla de Promedios",
    fase: datos.torneo,
  };
}

/* ── Fixture ────────────────────────────────────────────────────────── */

const formatoDia = new Intl.DateTimeFormat("es-AR", {
  weekday: "long", day: "numeric", month: "long",
});
const formatoHora = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit", minute: "2-digit",
});

/**
 * Columna izquierda: hora si falta, minuto si se juega, FIN si termino.
 *
 * `fresco` importa: estos datos son una foto que se saca dos veces por dia,
 * no un vivo. Un partido que estaba en juego al momento del scrape sigue
 * diciendo "45+4'" horas despues. Cuando la foto ya tiene rato, se muestra
 * el minuto sin pulso y aclarando que es el ultimo dato conocido, en vez de
 * fingir un vivo que no existe.
 */
function indicador(partido, fresco) {
  if (partido.estado === "en_juego") {
    const caja = el("div", "flex items-center gap-1.5 text-acento");
    const punto = el(
      "span",
      `h-1.5 w-1.5 shrink-0 rounded-full bg-acento ${fresco ? "animate-pulse motion-reduce:animate-none" : "opacity-60"}`
    );
    punto.setAttribute("aria-hidden", "true");
    const texto = el("span", "text-xs font-semibold", partido.minuto || "EN VIVO");
    if (!fresco) texto.title = "Ultimo dato conocido; la pagina se actualiza dos veces por dia";
    caja.append(punto, texto);
    return caja;
  }
  if (partido.estado === "finalizado") {
    return el("span", "text-xs font-semibold text-tenue", "FIN");
  }
  const hora = el("time", "text-xs font-semibold text-slate-300");
  if (partido.inicio) {
    hora.dateTime = partido.inicio;
    hora.textContent = formatoHora.format(new Date(partido.inicio));
  } else {
    hora.textContent = "--:--";
  }
  return hora;
}

function marcador(partido) {
  if (partido.estado === "programado") {
    return el("span", "px-2 text-xs font-medium text-tenue", "vs");
  }
  const { local, visitante } = partido;
  const caja = el("div", "flex items-center gap-1 px-1 font-bold tabular-nums");
  const gano = (a, b) => (partido.estado === "finalizado" && a > b ? "text-white" : "text-slate-300");
  caja.append(
    el("span", gano(local.goles, visitante.goles), String(local.goles ?? "-")),
    el("span", "text-tenue", "-"),
    el("span", gano(visitante.goles, local.goles), String(visitante.goles ?? "-"))
  );
  return caja;
}

function filaPartido(partido, fresco) {
  const fila = el(
    "li",
    "grid grid-cols-[3.4rem_1fr_auto_1fr] items-center gap-1 border-b border-borde/40 px-3 py-2.5 transition-colors last:border-0 hover:bg-panel2"
  );
  if (partido.estado === "en_juego") fila.classList.add("bg-acento/[0.06]");

  const apagado = partido.estado === "finalizado" ? "text-tenue" : "text-slate-100";

  const columnaIndicador = el("div", "flex justify-start");
  columnaIndicador.appendChild(indicador(partido, fresco));

  fila.append(
    columnaIndicador,
    el("span", `truncate text-right text-sm ${apagado}`, partido.local.corto),
    marcador(partido),
    el("span", `truncate text-sm ${apagado}`, partido.visitante.corto)
  );
  return fila;
}

const FRESCURA_MS = 15 * 60 * 1000;

function vistaFixture(datos) {
  // Si la foto tiene menos de 15 minutos, el estado "en vivo" es creible.
  const fresco = Date.now() - new Date(datos.actualizado).getTime() < FRESCURA_MS;

  const paneles = datos.fechas.map((fecha) => {
    const tarjeta = el("section", "overflow-hidden rounded-xl border border-borde bg-panel shadow-lg shadow-black/30");

    const enJuego = fecha.partidos.filter((p) => p.estado === "en_juego").length;
    const encabezado = el("div", "flex items-baseline justify-between gap-3 border-b border-borde px-4 py-3");
    encabezado.appendChild(el("h2", "font-display text-2xl font-semibold uppercase tracking-wide", fecha.nombre));
    encabezado.appendChild(
      el("span", enJuego ? "text-xs font-semibold text-acento" : "text-xs text-tenue",
         enJuego ? `${enJuego} en vivo` : `${fecha.partidos.length} partidos`)
    );
    tarjeta.appendChild(encabezado);

    // Agrupado por dia: un listado plano de 15 partidos no dice cuando se juega que.
    let diaActual = null;
    let lista = null;
    fecha.partidos.forEach((partido) => {
      const dia = partido.inicio ? formatoDia.format(new Date(partido.inicio)) : "A confirmar";
      if (dia !== diaActual) {
        diaActual = dia;
        tarjeta.appendChild(
          el("h3", "bg-panel2/70 px-4 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-tenue", dia)
        );
        lista = el("ul");
        tarjeta.appendChild(lista);
      }
      lista.appendChild(filaPartido(partido, fresco));
    });

    return tarjeta;
  });

  return { paneles, zonas: [], titulo: "Fixture", fase: datos.torneo };
}

/* ── Estados ────────────────────────────────────────────────────────── */

function esqueleto() {
  const tarjeta = el("div", "rounded-xl border border-borde bg-panel p-4");
  tarjeta.appendChild(el("div", "h-6 w-32 animate-pulse rounded bg-panel2 motion-reduce:animate-none"));
  const lista = el("div", "mt-4 space-y-2");
  for (let i = 0; i < 10; i++) {
    const fila = el("div", "h-7 animate-pulse rounded bg-panel2/70 motion-reduce:animate-none");
    fila.style.animationDelay = `${i * 40}ms`;
    lista.appendChild(fila);
  }
  tarjeta.appendChild(lista);
  return tarjeta;
}

function mostrarError(detalle) {
  leyenda.replaceChildren();
  const caja = el("div", "col-span-full rounded-xl border border-peligro/40 bg-peligro/5 px-5 py-8 text-center");
  caja.appendChild(el("p", "font-display text-2xl font-semibold uppercase text-peligro", "No se pudieron cargar los datos"));
  caja.appendChild(el("p", "mx-auto mt-2 max-w-md text-sm leading-relaxed text-tenue",
    "Si estas abriendo el archivo con file://, servilo por HTTP: python -m http.server 5501"));
  caja.appendChild(el("p", "mt-3 font-mono text-xs text-tenue/70", detalle));
  contenedor.replaceChildren(caja);
}

function pintarLeyenda(zonas) {
  leyenda.replaceChildren();
  zonas.forEach((zona) => {
    const item = el("span", "flex items-center gap-2");
    item.appendChild(el("span", "h-3 w-[3px] rounded-sm bg-zona"));
    item.appendChild(el("span", null, zona));
    leyenda.appendChild(item);
  });
}

function mostrarActualizado(iso) {
  if (!iso) return;
  const fecha = new Date(iso);
  elementoActualizado.textContent = `Actualizado ${fecha.toLocaleString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })} hs`;
}

/* ── Orquestacion ───────────────────────────────────────────────────── */

const VISTAS = {
  posiciones: { archivo: "./data/posiciones.json", construir: vistaPosiciones },
  promedios:  { archivo: "./data/promedios.json",  construir: vistaPromedios },
  fixture:    { archivo: "./data/fixture.json",    construir: vistaFixture },
};

const CLASES_TAB_ACTIVA = ["bg-acento", "text-fondo", "shadow"];
const CLASES_TAB_INACTIVA = ["text-tenue", "hover:text-slate-100"];

async function mostrarVista(nombre) {
  const vista = VISTAS[nombre];
  if (!vista) return;

  document.querySelectorAll("[data-vista]").forEach((boton) => {
    if (!boton.classList.contains("nav-tab")) return;
    const activa = boton.dataset.vista === nombre;
    boton.classList.toggle("bg-acento", activa);
    boton.classList.toggle("text-fondo", activa);
    boton.classList.toggle("shadow", activa);
    boton.classList.toggle("text-tenue", !activa);
    boton.classList.toggle("hover:text-slate-100", !activa);
    boton.setAttribute("aria-current", activa ? "page" : "false");
  });

  contenedor.setAttribute("aria-busy", "true");
  contenedor.replaceChildren(esqueleto(), esqueleto());

  try {
    const respuesta = await fetch(vista.archivo, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();

    const { paneles, zonas, titulo, fase } = vista.construir(datos);
    contenedor.replaceChildren(...paneles);
    contenedor.classList.toggle("lg:grid-cols-2", paneles.length > 1);
    pintarLeyenda(zonas);
    elementoTitulo.textContent = titulo;
    elementoFase.textContent = fase || "";
    mostrarActualizado(datos.actualizado);
  } catch (error) {
    console.error(error);
    mostrarError(String(error.message || error));
    elementoActualizado.textContent = "Sin datos";
  } finally {
    contenedor.setAttribute("aria-busy", "false");
  }
}

document.querySelectorAll("[data-vista]").forEach((boton) => {
  boton.addEventListener("click", (evento) => {
    evento.preventDefault();
    mostrarVista(boton.dataset.vista);
  });
});

mostrarVista("posiciones");
