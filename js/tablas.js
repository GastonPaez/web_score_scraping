/**
 * Renderiza las tablas desde los JSON estaticos de data/.
 *
 * No hay scraping en el navegador: los archivos los genera
 * scraper/scrape_promiedos.py en GitHub Actions y quedan commiteados en el
 * repo. Aca solo se leen con fetch relativo, asi que no hay API keys, ni CORS,
 * ni dependencia de ningun servicio externo en tiempo de ejecucion.
 */

// Unica fuente de verdad del orden y ancho de columnas: el HTML y el CSS ya no
// repiten esta informacion.
const COLUMNAS = [
  { clave: "pos", titulo: "Pos", ancho: "34px" },
  { clave: "equipo", titulo: "Equipo", ancho: "minmax(110px, 1fr)", alineacion: "izquierda" },
  { clave: "pts", titulo: "Pts", ancho: "38px", destacada: true },
  { clave: "pj", titulo: "PJ", ancho: "32px" },
  { clave: "pg", titulo: "PG", ancho: "32px" },
  { clave: "pe", titulo: "PE", ancho: "32px" },
  { clave: "pp", titulo: "PP", ancho: "32px" },
  { clave: "gf", titulo: "GF", ancho: "32px" },
  { clave: "gc", titulo: "GC", ancho: "32px" },
  { clave: "dif", titulo: "DIF", ancho: "38px" },
];

const contenedor = document.querySelector("#tablas");
const pieActualizado = document.querySelector("#actualizado");

/** Crea un div con clase y texto. Se usa textContent, nunca innerHTML: los
 *  nombres de equipo vienen de una fuente externa y no deben interpretarse
 *  como HTML. */
function celda(clase, texto) {
  const div = document.createElement("div");
  div.className = clase;
  div.textContent = texto;
  return div;
}

function construirTabla({ titulo, columnas, filas }) {
  const tabla = document.createElement("section");
  tabla.className = "tabla";
  tabla.style.setProperty("--columnas", columnas.map((c) => c.ancho).join(" "));

  const encabezadoTitulo = celda("tabla__titulo", titulo);
  encabezadoTitulo.style.gridColumn = `1 / ${columnas.length + 1}`;
  tabla.appendChild(encabezadoTitulo);

  for (const columna of columnas) {
    tabla.appendChild(celda("tabla__encabezado", columna.titulo));
  }

  for (const fila of filas) {
    columnas.forEach((columna, indice) => {
      const clases = ["tabla__celda"];
      if (columna.destacada) clases.push("tabla__celda--destacada");
      if (columna.alineacion === "izquierda") clases.push("tabla__celda--izquierda");
      tabla.appendChild(celda(clases.join(" "), fila[indice]));
    });
  }

  return tabla;
}

function tablasDePosiciones(datos) {
  return datos.grupos.map((grupo) =>
    construirTabla({
      titulo: grupo.nombre,
      columnas: COLUMNAS,
      filas: grupo.filas.map((equipo) => COLUMNAS.map((c) => equipo[c.clave])),
    })
  );
}

function tablasDePromedios(datos) {
  // Las columnas de promedios varian por temporada, asi que vienen en el JSON.
  const columnas = [
    { titulo: "Pos", ancho: "34px" },
    { titulo: "Equipo", ancho: "minmax(110px, 1fr)", alineacion: "izquierda" },
    ...datos.columnas.map((titulo, i) => ({
      titulo,
      ancho: "42px",
      destacada: i === 0, // la primera es el promedio
    })),
  ];

  return [
    construirTabla({
      titulo: "Promedios",
      columnas,
      filas: datos.filas.map((equipo) => [equipo.pos, equipo.equipo, ...equipo.valores]),
    }),
  ];
}

function mostrarMensaje(texto) {
  contenedor.replaceChildren(celda("mensaje", texto));
}

function mostrarActualizado(iso) {
  if (!iso) return;
  const fecha = new Date(iso);
  pieActualizado.textContent = `Actualizado: ${fecha.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

const VISTAS = {
  posiciones: { archivo: "./data/posiciones.json", construir: tablasDePosiciones },
  promedios: { archivo: "./data/promedios.json", construir: tablasDePromedios },
};

async function mostrarVista(nombre) {
  const vista = VISTAS[nombre];
  if (!vista) return;

  document.querySelectorAll("[data-vista]").forEach((enlace) => {
    enlace.classList.toggle("activo", enlace.dataset.vista === nombre);
  });
  mostrarMensaje("Cargando...");

  try {
    const respuesta = await fetch(vista.archivo, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();

    contenedor.replaceChildren(...vista.construir(datos));
    mostrarActualizado(datos.actualizado);
  } catch (error) {
    console.error(error);
    mostrarMensaje(
      "No se pudieron cargar los datos. Si estas abriendo el archivo con file://, " +
        "servilo por HTTP (por ejemplo: python -m http.server 5501)."
    );
  }
}

document.querySelectorAll("[data-vista]").forEach((enlace) => {
  enlace.addEventListener("click", (evento) => {
    evento.preventDefault();
    mostrarVista(enlace.dataset.vista);
  });
});

mostrarVista("posiciones");
