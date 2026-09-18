#!/usr/bin/env python3
"""Scrapea las tablas de la Liga Profesional Argentina y las escribe en data/.

Promiedos es una app Next.js que embebe TODOS los datos de la pagina dentro de
un <script id="__NEXT_DATA__">. Por eso esto no parsea HTML ni ejecuta
JavaScript: alcanza con un GET y leer ese JSON. Es mucho mas estable que
apuntar selectores CSS al maquetado visual.

Uso:
    python scraper/scrape_promiedos.py            # escribe data/*.json
    python scraper/scrape_promiedos.py --dry-run  # solo valida e imprime

Sale con codigo != 0 si los datos no pasan las validaciones, para que el job de
CI falle y NO se commitee un JSON roto: asi la web sigue sirviendo el ultimo
dato bueno.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

LIGA = "hc"  # Liga Profesional Argentina
URL = f"https://www.promiedos.com.ar/league/liga-profesional/{LIGA}"
# Los partidos de una fecha distinta a la que muestra la pagina se piden aca.
URL_FECHA = "https://api.promiedos.com.ar/league/games/" + LIGA + "/{clave}"
USER_AGENT = "tabla-posiciones-bot/1.0 (+https://github.com/GastonPaez/web_score_scraping)"

# El horario que publica Promiedos es hora de Argentina (UTC-3). Se emite con
# offset explicito para que el navegador lo muestre bien en cualquier zona.
TZ_ARGENTINA = timezone(timedelta(hours=-3))

ESTADOS = {1: "programado", 2: "en_juego", 3: "finalizado"}

RAIZ = Path(__file__).resolve().parents[1]
DIR_DATOS = RAIZ / "data"

# Minimos que tiene que cumplir el scrape para considerarse valido.
MIN_EQUIPOS_POR_TABLA = 8
MIN_EQUIPOS_PROMEDIOS = 20
MIN_PARTIDOS_POR_FECHA = 4

PATRON_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)


class ScrapeError(RuntimeError):
    """Algo cambio en el origen y los datos no son confiables."""


# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------
def bajar_next_data(url: str = URL) -> dict:
    respuesta = httpx.get(
        url,
        timeout=30,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "es-AR,es;q=0.9"},
    )
    respuesta.raise_for_status()

    match = PATRON_NEXT_DATA.search(respuesta.text)
    if not match:
        raise ScrapeError(
            "No se encontro el bloque __NEXT_DATA__. Promiedos puede haber "
            "cambiado de framework o estar sirviendo una pagina de error."
        )
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ScrapeError(f"__NEXT_DATA__ no es JSON valido: {exc}") from exc


def bajar_json(url: str) -> dict:
    respuesta = httpx.get(
        url,
        timeout=30,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    respuesta.raise_for_status()
    return respuesta.json()


def datos_de_liga(next_data: dict) -> dict:
    try:
        datos = next_data["props"]["pageProps"]["data"]
    except (KeyError, TypeError) as exc:
        raise ScrapeError(f"Estructura inesperada en __NEXT_DATA__: falta {exc}") from exc
    if not datos or "tables_groups" not in datos:
        raise ScrapeError("La respuesta no trae 'tables_groups'.")
    return datos


# ---------------------------------------------------------------------------
# Normalizacion
# ---------------------------------------------------------------------------
def _valores(fila: dict) -> dict:
    return {v["key"]: v["value"] for v in fila.get("values", [])}


def _entero(texto, defecto: int = 0) -> int:
    """'12', '+12', '-3' -> int. Cualquier cosa rara -> defecto."""
    try:
        return int(str(texto).strip().replace("+", ""))
    except (TypeError, ValueError):
        return defecto


def _goles(valor) -> tuple:
    """Promiedos manda los goles como 'GF:GC' en un solo campo."""
    partes = str(valor).split(":")
    if len(partes) != 2:
        return 0, 0
    return _entero(partes[0]), _entero(partes[1])


def normalizar_fila(fila: dict, zonas_por_color: dict = None) -> dict:
    vals = _valores(fila)
    equipo = fila.get("entity", {}).get("object", {})
    gf, gc = _goles(vals.get("Goals", ""))
    color = fila.get("destination_color")
    return {
        "pos": _entero(fila.get("num")),
        "equipo": (equipo.get("name") or "").strip(),
        "pts": _entero(vals.get("Points")),
        "pj": _entero(vals.get("GamePlayed")),
        "pg": _entero(vals.get("GamesWon")),
        "pe": _entero(vals.get("GamesEven")),
        "pp": _entero(vals.get("GamesLost")),
        "gf": gf,
        "gc": gc,
        "dif": _entero(vals.get("Ratio"), defecto=gf - gc),
        # Nombre de la zona de clasificacion ("Octavos de Final", "Descenso",
        # etc) o None. Viene de los datos, no se infiere por posicion: el
        # formato del torneo cambia todos los años.
        "zona": (zonas_por_color or {}).get(color),
    }


def normalizar_fila_promedios(fila: dict, columnas: list) -> dict:
    """La tabla de promedios tiene columnas variables (una por temporada), asi
    que se emite generica: titulos + valores en el mismo orden."""
    vals = _valores(fila)
    equipo = fila.get("entity", {}).get("object", {})
    return {
        "pos": _entero(fila.get("num")),
        "equipo": (equipo.get("name") or "").strip(),
        "valores": [str(vals.get(col["key"], "-")) for col in columnas],
    }


# ---------------------------------------------------------------------------
# Extraccion
# ---------------------------------------------------------------------------
def _es_tabla_agregada(nombre: str) -> bool:
    """Promedios y Tabla Anual no son la fase en curso."""
    nombre = nombre.lower()
    return "promedio" in nombre or "anual" in nombre


def extraer_posiciones(datos: dict) -> dict:
    """Primer grupo de tablas = fase en curso (Clausura, Apertura, etc).

    No se hardcodea ni la cantidad de grupos ni sus nombres: si el torneo pasa
    de dos zonas a una tabla unica, esto sigue funcionando igual.
    """
    grupos = [
        g
        for g in datos["tables_groups"]
        if any(t.get("table", {}).get("rows") for t in g.get("tables", []))
        and not any(_es_tabla_agregada(t.get("name", "")) for t in g.get("tables", []))
    ]
    if not grupos:
        raise ScrapeError("No hay ningun grupo de tablas con filas.")

    grupo = grupos[0]
    tablas = []
    for tabla in grupo.get("tables", []):
        interna = tabla.get("table", {})

        destinos = interna.get("destinations") or []
        zonas_por_color = {d.get("color"): d.get("name") for d in destinos if d.get("color")}

        filas = [normalizar_fila(f, zonas_por_color) for f in interna.get("rows", [])]
        if len(filas) < MIN_EQUIPOS_POR_TABLA:
            raise ScrapeError(
                f"La tabla '{tabla.get('name')}' trajo {len(filas)} equipos "
                f"(minimo esperado: {MIN_EQUIPOS_POR_TABLA})."
            )
        tablas.append(
            {
                "nombre": tabla.get("name", "Tabla"),
                # Para la leyenda: las zonas que realmente aparecen en esta tabla.
                "zonas": [d.get("name") for d in destinos if d.get("name")],
                "filas": filas,
            }
        )

    return {
        "torneo": datos.get("league", {}).get("name") or "Liga Profesional",
        "fase": grupo.get("name") or "",
        "grupos": tablas,
    }


def _fecha_iso(texto: str):
    """'18-09-2026 18:00' (hora de Argentina) -> ISO con offset -03:00."""
    try:
        ingenua = datetime.strptime(texto.strip(), "%d-%m-%Y %H:%M")
    except (AttributeError, ValueError):
        return None
    return ingenua.replace(tzinfo=TZ_ARGENTINA).isoformat()


def normalizar_partido(partido: dict):
    equipos = partido.get("teams") or []
    if len(equipos) != 2:
        return None

    marcadores = partido.get("scores") or []
    estado = partido.get("status") or {}
    enum = estado.get("enum")

    def lado(i):
        equipo = equipos[i]
        gol = marcadores[i] if i < len(marcadores) and marcadores[i] is not None else None
        return {
            "nombre": (equipo.get("name") or "").strip(),
            "corto": (equipo.get("short_name") or equipo.get("name") or "").strip(),
            "goles": int(gol) if gol is not None else None,
            "color": (equipo.get("colors") or {}).get("color"),
        }

    return {
        "id": partido.get("id"),
        "inicio": _fecha_iso(partido.get("start_time", "")),
        "estado": ESTADOS.get(enum, "desconocido"),
        "estado_texto": (estado.get("name") or "").strip(),
        # Solo tiene sentido mientras el partido se juega.
        "minuto": partido.get("game_time_to_display") if enum == 2 else None,
        "local": lado(0),
        "visitante": lado(1),
    }


def extraer_fixture(datos: dict) -> dict:
    """La fecha que muestra la pagina + la siguiente.

    La pagina solo embebe los partidos de la fecha seleccionada; el resto se
    piden a la API. Se traen dos fechas y no las 37 del torneo: alcanza para
    "que se viene" y mantiene el scraping en 2 requests por corrida.
    """
    filtros = (datos.get("games") or {}).get("filters") or []
    if not filtros:
        raise ScrapeError("La respuesta no trae 'games.filters'.")

    indice = next(
        (i for i, f in enumerate(filtros) if f.get("selected")),
        next((i for i, f in enumerate(filtros) if f.get("games")), None),
    )
    if indice is None:
        raise ScrapeError("Ninguna fecha viene seleccionada ni con partidos.")

    fechas = []
    for posicion, filtro in ((indice, filtros[indice]), (indice + 1, None)):
        if posicion >= len(filtros):
            break
        filtro = filtro or filtros[posicion]
        if filtro.get("key") == "latest":
            continue

        crudos = filtro.get("games")
        if crudos is None:  # la fecha siguiente no viene embebida
            try:
                crudos = bajar_json(URL_FECHA.format(clave=filtro["key"])).get("games") or []
            except (httpx.HTTPError, ValueError, KeyError):
                # Que falle la fecha siguiente no justifica tirar todo abajo:
                # la fecha en curso ya es util por si sola.
                continue

        partidos = [p for p in (normalizar_partido(g) for g in crudos) if p]
        if len(partidos) < MIN_PARTIDOS_POR_FECHA:
            continue
        partidos.sort(key=lambda p: p["inicio"] or "")
        fechas.append({"nombre": filtro.get("name", "Fecha"), "partidos": partidos})

    if not fechas:
        raise ScrapeError("No se pudo armar ninguna fecha del fixture.")

    return {
        "torneo": datos.get("league", {}).get("name") or "Liga Profesional",
        "fechas": fechas,
    }


def extraer_promedios(datos: dict):
    for grupo in datos["tables_groups"]:
        for tabla in grupo.get("tables", []):
            if "promedio" not in tabla.get("name", "").lower():
                continue
            interna = tabla.get("table", {})
            columnas = [c for c in interna.get("columns", []) if c.get("key") != "{trend}"]
            filas = [normalizar_fila_promedios(f, columnas) for f in interna.get("rows", [])]
            if len(filas) < MIN_EQUIPOS_PROMEDIOS:
                raise ScrapeError(
                    f"Promedios trajo {len(filas)} equipos "
                    f"(minimo esperado: {MIN_EQUIPOS_PROMEDIOS})."
                )
            return {
                "torneo": datos.get("league", {}).get("name") or "Liga Profesional",
                "columnas": [c.get("title", c.get("key", "")) for c in columnas],
                "filas": filas,
            }
    return None


# ---------------------------------------------------------------------------
# Validacion
# ---------------------------------------------------------------------------
def validar_posiciones(paquete: dict) -> None:
    """Chequeos de sanidad. Si algo no cierra, mejor fallar que publicar basura."""
    total = 0
    for grupo in paquete["grupos"]:
        filas = grupo["filas"]
        nombre = grupo["nombre"]
        total += len(filas)

        sin_nombre = [f for f in filas if not f["equipo"]]
        if sin_nombre:
            raise ScrapeError(f"{len(sin_nombre)} equipos sin nombre en '{nombre}'.")

        if all(f["pj"] == 0 for f in filas):
            raise ScrapeError(f"Todos los equipos de '{nombre}' tienen 0 partidos jugados.")

        if all(f["pts"] == 0 for f in filas):
            raise ScrapeError(f"Todos los equipos de '{nombre}' tienen 0 puntos.")

        for f in filas:
            if f["pg"] + f["pe"] + f["pp"] != f["pj"]:
                raise ScrapeError(
                    f"Aritmetica rota en {f['equipo']}: "
                    f"{f['pg']}+{f['pe']}+{f['pp']} != {f['pj']} PJ."
                )
            if f["pts"] > f["pj"] * 3:
                raise ScrapeError(
                    f"{f['equipo']} tiene {f['pts']} pts en {f['pj']} PJ (imposible)."
                )

        posiciones = [f["pos"] for f in filas]
        if posiciones != sorted(posiciones):
            raise ScrapeError(f"Las posiciones de '{nombre}' no vienen ordenadas.")

    if total == 0:
        raise ScrapeError("No se extrajo ningun equipo.")


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------
def escribir(nombre: str, paquete: dict) -> Path:
    DIR_DATOS.mkdir(parents=True, exist_ok=True)
    destino = DIR_DATOS / nombre
    contenido = {
        "actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fuente": URL,
    }
    contenido.update(paquete)
    destino.write_text(
        json.dumps(contenido, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return destino


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    try:
        datos = datos_de_liga(bajar_next_data())

        posiciones = extraer_posiciones(datos)
        validar_posiciones(posiciones)

        promedios = extraer_promedios(datos)
        fixture = extraer_fixture(datos)
    except (ScrapeError, httpx.HTTPError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    resumen = " | ".join(f"{g['nombre']}: {len(g['filas'])}" for g in posiciones["grupos"])
    print(f"Torneo: {posiciones['torneo']} - fase '{posiciones['fase']}'")
    print(f"Posiciones -> {resumen}")
    print(f"Promedios  -> {len(promedios['filas']) if promedios else 0} equipos")
    print("Fixture    -> " + " | ".join(
        f"{f['nombre']}: {len(f['partidos'])}" for f in fixture["fechas"]))

    if dry_run:
        print("\n--dry-run: no se escribio nada.")
        return 0

    print(f"Escrito: {escribir('posiciones.json', posiciones).relative_to(RAIZ)}")
    if promedios:
        print(f"Escrito: {escribir('promedios.json', promedios).relative_to(RAIZ)}")
    print(f"Escrito: {escribir('fixture.json', fixture).relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
