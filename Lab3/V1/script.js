// ============================================================
//  SIMULADOR DE GESTIÓN DE MEMORIA RAM
//  Modos: Particiones (fija / variable / dinámica / compactada)
//         + Segmentación + Paginación
// ============================================================

// ── Constantes de la memoria ──────────────────────────────
const MIB          = 1024 * 1024;
const RAM_TOTAL    = 16 * MIB;          // 16 MiB físicos
const TAMANO_SO    = 1  * MIB;          // 1 MiB reservado para SO
const INICIO_USUARIO = TAMANO_SO;
const FIN_RAM      = RAM_TOTAL;

// ── Definición de segmentos de programa ──────────────────
// Cada segmento tiene un nombre, un índice canónico, sus permisos y
// una opacidad visual para diferenciarlos en la barra de RAM.
const TIPOS_SEGMENTO = [
  { nombre: '.text', permisos: 'R-X', indice: 0 },
  { nombre: '.data', permisos: 'RW-', indice: 1 },
  { nombre: '.bss',  permisos: 'RW-', indice: 2 },
];

// ── Programas por defecto ─────────────────────────────────
const programas = [
  { pid: 'P1',  nombre: 'Notepad',             tamano: 224649,  color: 'var(--p1)'  },
  { pid: 'P2',  nombre: 'Word',                tamano: 286708,  color: 'var(--p2)'  },
  { pid: 'P3',  nombre: 'Excel',               tamano: 309150,  color: 'var(--p3)'  },
  { pid: 'P4',  nombre: 'AutoCAD',             tamano: 436201,  color: 'var(--p4)'  },
  { pid: 'P5',  nombre: 'Calculadora',         tamano: 209462,  color: 'var(--p5)'  },
  { pid: 'P6',  nombre: 'Adobe Premiere Pro',  tamano: 3996608, color: 'var(--p6)'  },
  { pid: 'P7',  nombre: 'Visual Studio Code',  tamano: 1785608, color: 'var(--p7)'  },
  { pid: 'P8',  nombre: 'Blender',             tamano: 2696608, color: 'var(--p8)'  },
  { pid: 'P9',  nombre: 'Apache HTTP Server',  tamano: 1572864, color: 'var(--p9)'  },
  { pid: 'P10', nombre: 'MySQL Server',        tamano: 1310720, color: 'var(--p10)' },
  { pid: 'P11', nombre: 'Google Chrome',       tamano: 1835008, color: 'var(--p11)' },
  { pid: 'P12', nombre: 'Eclipse IDE',         tamano: 1048576, color: 'var(--p12)' },
  { pid: 'P13', nombre: '7-Zip',               tamano: 131072,  color: 'var(--p13)' },
];

// ── Persistencia ──────────────────────────────────────────
const CLAVE_PROGRAMAS = 'simulador-ram-programas';

function cargarProgramasGuardados() {
  try {
    const guardado = window.localStorage.getItem(CLAVE_PROGRAMAS);
    if (!guardado) return null;
    const datos = JSON.parse(guardado);
    return Array.isArray(datos) && datos.length > 0 ? datos : null;
  } catch (e) {
    console.warn('No se pudo leer la lista de programas guardada:', e);
    return null;
  }
}

function guardarProgramas() {
  try {
    window.localStorage.setItem(CLAVE_PROGRAMAS, JSON.stringify(programas));
  } catch (e) {
    console.warn('No se pudo guardar la lista de programas:', e);
  }
}

const programasGuardados = cargarProgramasGuardados();
if (programasGuardados) {
  programas.length = 0;
  programas.push(...programasGuardados);
}

// ── Referencias al DOM ────────────────────────────────────
const tipoParticion      = document.querySelector('#tipo-particion');
const algoritmo          = document.querySelector('#algoritmo');
const listaProgramas     = document.querySelector('#lista-programas');
const tablaParticiones   = document.querySelector('#tabla-particiones');
const tablaFragmentos    = document.querySelector('#tabla-fragmentos');
const tablaFragmentosContenedor = document.querySelector('#tabla-fragmentos-contenedor');
const ram                = document.querySelector('#ram');
const mensaje            = document.querySelector('#mensaje');
const reloj              = document.querySelector('#reloj');
const iniciar            = document.querySelector('#iniciar');
const detener            = document.querySelector('#detener');
const reiniciar          = document.querySelector('#reiniciar');
const tamanoParticionFija = document.querySelector('#tamano-particion-fija');
const agregarProgramaBoton = document.querySelector('#agregar-programa');
const resumenOcupacion   = document.querySelector('#resumen-ocupacion');
const resumenHuecos      = document.querySelector('#resumen-huecos');
const ramUsoRelleno      = document.querySelector('#ram-uso-relleno');
const ramUsoPorcentaje   = document.querySelector('#ram-uso-porcentaje');
const ramUsoDisponible   = document.querySelector('#ram-uso-disponible');

// Vistas de modos
const vistaParticiones   = document.querySelector('#vista-particiones');
const vistaSegmentacion  = document.querySelector('#vista-segmentacion');
const vistaPaginacion    = document.querySelector('#vista-paginacion');

// Tablas de segmentación
const tablaSegmentos       = document.querySelector('#tabla-segmentos');
const tablaFragmentosSeg   = document.querySelector('#tabla-fragmentos-seg');
const resumenSegOcupacion  = document.querySelector('#resumen-seg-ocupacion');
const resumenSegSegs       = document.querySelector('#resumen-seg-segs');

// Tablas de paginación
const tablaPaginas              = document.querySelector('#tabla-paginas');
const mapaBitsContenedor        = document.querySelector('#mapa-bits-contenedor');
const calculoPaginacionContenedor = document.querySelector('#calculo-paginacion-contenedor');
const tablaCalculoPaginacion    = document.querySelector('#tabla-calculo-paginacion');
const resumenPagOcupacion       = document.querySelector('#resumen-pag-ocupacion');
const resumenPagMarcos          = document.querySelector('#resumen-pag-marcos');

// Control de tamaño de página
const tamanoPaginaSelect = document.querySelector('#tamano-pagina');

// Sección independiente del Mapa de marcos (solo visible en paginación)
const seccionMapaMarcos = document.querySelector('#seccion-mapa-marcos');

// Paleta de colores para nuevos programas
const paletaColores = [
  'var(--p1)',  'var(--p2)',  'var(--p3)',  'var(--p4)',
  'var(--p5)',  'var(--p6)',  'var(--p7)',  'var(--p8)',
  'var(--p9)',  'var(--p10)', 'var(--p11)', 'var(--p12)', 'var(--p13)',
];

// ── Estado global de la simulación ───────────────────────
let segmentos          = [];   // para los modos de particiones
// estados: instancia-id (iid) → 'En RAM' | 'Finalizado'
// Ya NO se indexa por el pid del programa: un mismo programa puede tener
// varias instancias cargadas a la vez, cada una con su propio iid.
let estados            = {};
let numeroEvento       = 0;
let simulacionActiva   = false;
let simulacionIniciada = false;

// ── INSTANCIAS DE PROGRAMA ───────────────────────────────
// Para poder abrir el mismo programa varias veces (p. ej. Word dos veces),
// separamos el CATÁLOGO de programas (array `programas`) de las INSTANCIAS
// cargadas en RAM. Cada instancia tiene un id único `iid` con el formato
// "P2#1", "P2#2"… donde la parte antes de '#' es el pid del programa origen.
// Los bloques de memoria (segmentos / segmentosRam / mapaBitMarcos) y la
// tabla de páginas se indexan por ESTE iid, no por el pid del programa.
let instancias = [];            // [{ iid, programaPid }]
let contadorInstancias = {};    // programaPid → nº de instancias creadas (para numerar #1, #2…)

// Crea y registra una nueva instancia del programa indicado; devuelve su iid.
function crearInstancia(programaPid) {
  contadorInstancias[programaPid] = (contadorInstancias[programaPid] || 0) + 1;
  const iid = `${programaPid}#${contadorInstancias[programaPid]}`;
  instancias.push({ iid, programaPid });
  return iid;
}

// Dado un iid ("P2#3"), devuelve el pid del programa origen ("P2").
function pidDeInstancia(iid) {
  return typeof iid === 'string' ? iid.split('#')[0] : iid;
}

// Dado un iid, devuelve el objeto programa del catálogo.
function obtenerProgramaDeInstancia(iid) {
  return obtenerPrograma(pidDeInstancia(iid));
}

// Instancias actualmente cargadas en RAM de un programa dado.
function instanciasEnRam(programaPid) {
  return instancias.filter(i => i.programaPid === programaPid && estados[i.iid] === 'En RAM');
}

// ── Estado para Segmentación ─────────────────────────────
// Cada entrada de segmentosRam describe un trozo de la RAM con:
//   { base, tamano, pid (null=libre), tipoSeg ('hueco'|'.text'|'.data'|'.bss'), indiceSegmento }
let segmentosRam = [];

// ── Estado para Paginación ───────────────────────────────
// Mapa de bits de marcos: array de objetos { pid: null | string, pagina: null | number }
// índice == número de marco físico. pid=null significa libre (bit 0), pid≠null ocupado (bit 1).
// NOTA: el campo `pid` guarda el iid de la INSTANCIA dueña del marco, no el
// pid del programa (así dos instancias del mismo programa no se confunden).
let mapaBitMarcos = [];

// Tabla de páginas por instancia: Map<iid, Array<{ pagina, marco, tipoSeg }>>
let tablaDePagesPorPid = new Map();

// Último proceso cargado (para mostrar panel de cálculo)
let ultimoCargadoPag = null;

// ── Utilidades ────────────────────────────────────────────
function formatearTamano(bytes) {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function formatearHex(numero) {
  return `0x${numero.toString(16).toUpperCase().padStart(6, '0')}`;
}

function obtenerPrograma(pid) {
  return programas.find(p => p.pid === pid);
}

function modoActual() {
  return tipoParticion.value; // 'fija'|'variable'|'dinamica'|'compactada'|'segmentacion'|'paginacion'
}

function esModoPaginacion()    { return modoActual() === 'paginacion'; }
function esModoSegmentacion()  { return modoActual() === 'segmentacion'; }
function esModoParticiones()   { return !esModoPaginacion() && !esModoSegmentacion(); }

function tamanoMarcoBytesActual() {
  return parseInt(tamanoPaginaSelect.value, 10); // 4096 u 8192
}

function totalMarcosUsuario() {
  const totalUsuario = RAM_TOTAL - TAMANO_SO;
  return Math.floor(totalUsuario / tamanoMarcoBytesActual());
}

function mostrarMensajeUsuario(texto) {
  mensaje.textContent = texto;
}

// ── Tooltip flotante del Mapa de marcos ───────────────────
// Un único elemento con position: fixed anclado al <body>. Al estar fuera
// de los contenedores con overflow (panel y mapa), nunca se recorta en los
// bordes, por mucho scroll que tengan sus ancestros.
const tooltipMarco = document.createElement('div');
tooltipMarco.className = 'tooltip-flotante';
tooltipMarco.setAttribute('role', 'tooltip');
document.body.appendChild(tooltipMarco);

function posicionarTooltipMarco(evento) {
  // Seguir al cursor con un pequeño desfase hacia arriba
  const margen = 12;
  let x = evento.clientX;
  let y = evento.clientY - margen;
  // Evitar que el tooltip se salga por la izquierda/derecha del viewport
  const mitad = tooltipMarco.offsetWidth / 2;
  if (x - mitad < 4) x = mitad + 4;
  if (x + mitad > window.innerWidth - 4) x = window.innerWidth - mitad - 4;
  tooltipMarco.style.left = `${x}px`;
  tooltipMarco.style.top  = `${y}px`;
}

function mostrarTooltipMarco(texto, evento) {
  tooltipMarco.textContent = texto;
  tooltipMarco.classList.add('visible');
  posicionarTooltipMarco(evento);
}

function ocultarTooltipMarco() {
  tooltipMarco.classList.remove('visible');
}

// ── Generación de PIDs ────────────────────────────────────
function generarNuevoPid() {
  let maximo = 0;
  programas.forEach(p => {
    const m = /^P(\d+)$/.exec(p.pid);
    if (m) maximo = Math.max(maximo, Number(m[1]));
  });
  return `P${maximo + 1}`;
}

// ── División del programa en segmentos (.text / .data / .bss) ────────────
// Para reflejar sistemas reales, el tamaño total se reparte con proporciones
// aleatorias entre los tres segmentos canónicos.
// .text   ≈ 50–65 % (código ejecutable, crece poco)
// .data   ≈ 20–35 % (datos inicializados)
// .bss    = resto  (datos no inicializados; suele ser el segmento más pequeño)
function dividirEnSegmentos(tamanoTotal) {
  const fracTexto = 0.50 + Math.random() * 0.15; // [0.50, 0.65]
  const fracData  = 0.20 + Math.random() * 0.15; // [0.20, 0.35]
  // Garantizamos al menos 1 byte por segmento
  const tamText = Math.max(1, Math.floor(tamanoTotal * fracTexto));
  const tamData = Math.max(1, Math.floor(tamanoTotal * fracData));
  const tamBss  = Math.max(1, tamanoTotal - tamText - tamData);
  return [
    { tipo: '.text', tamano: tamText },
    { tipo: '.data', tamano: tamData },
    { tipo: '.bss',  tamano: tamBss  },
  ];
}

// ── Gestión de programas (agregar / eliminar) ─────────────
function agregarPrograma() {
  const nombre = window.prompt('Nombre del nuevo programa:');
  if (!nombre || !nombre.trim()) return;
  const tamanoTexto = window.prompt('Tamaño del programa en bytes (ej: 250000):', '250000');
  const tamano = parseInt(tamanoTexto, 10);
  if (!Number.isFinite(tamano) || tamano <= 0) {
    mostrarMensajeUsuario('No se agregó el programa: el tamaño debe ser un número mayor a 0.');
    return;
  }
  const pid   = generarNuevoPid();
  const color = paletaColores[programas.length % paletaColores.length];
  programas.push({ pid, nombre: nombre.trim(), tamano, color });
  guardarProgramas();
  numeroEvento += 1;
  mostrarMensajeUsuario(`${nombre.trim()} (${pid}) se agregó a la cola de espera.`);
  renderizarTodo();
}

function eliminarPrograma(pid) {
  const programa = obtenerPrograma(pid);
  if (!programa) return;
  const confirmado = window.confirm(`¿Eliminar definitivamente "${programa.nombre}" (${pid})? Esta acción no se puede deshacer.`);
  if (!confirmado) return;
  // Liberar primero TODAS las instancias vivas de este programa en RAM.
  instanciasEnRam(pid).forEach(inst => liberarProceso(inst.iid));
  // Quitar del registro de instancias cualquier resto (p. ej. finalizadas).
  instancias = instancias.filter(i => i.programaPid !== pid);
  const indice = programas.findIndex(p => p.pid === pid);
  if (indice !== -1) programas.splice(indice, 1);
  guardarProgramas();
  numeroEvento += 1;
  mostrarMensajeUsuario(`${programa.nombre} (${pid}) se eliminó de la lista.`);
  renderizarTodo();
}

// ══════════════════════════════════════════════════════════
//  LÓGICA DE PARTICIONES (sin cambios respecto a la versión original)
// ══════════════════════════════════════════════════════════
function crearParticionesEstaticas(tamanos) {
  let base = INICIO_USUARIO;
  return tamanos.map((tamano, indice) => {
    const p = { id: `particion-${indice + 1}`, base, tamano, pid: null, tipo: 'particion' };
    base += tamano;
    return p;
  });
}

function obtenerTamanoParticionFijaBytes() {
  const kib = Number(tamanoParticionFija.value);
  if (!Number.isFinite(kib) || kib <= 0) return MIB;
  return Math.round(kib * 1024);
}

function crearMemoriaInicial() {
  if (tipoParticion.value === 'fija') {
    const totalUsuario = RAM_TOTAL - TAMANO_SO;
    const tamanoFija   = obtenerTamanoParticionFijaBytes();
    const cantidad     = Math.floor(totalUsuario / tamanoFija);
    const tamanos      = Array(cantidad).fill(tamanoFija);
    const particiones  = crearParticionesEstaticas(tamanos);
    const resto        = totalUsuario - cantidad * tamanoFija;
    if (resto > 0) {
      particiones.push({
        id: 'resto-no-utilizable',
        base: INICIO_USUARIO + cantidad * tamanoFija,
        tamano: resto,
        pid: null,
        tipo: 'no-utilizable',
      });
    }
    return particiones;
  }
  if (tipoParticion.value === 'variable') {
    return crearParticionesEstaticas([
      512 * 1024, 512 * 1024,
      1 * MIB,  1 * MIB,
      2 * MIB,  2 * MIB,
      4 * MIB,  4 * MIB,
    ]);
  }
  return [{ id: 'hueco-inicial', base: INICIO_USUARIO, tamano: RAM_TOTAL - TAMANO_SO, pid: null, tipo: 'hueco' }];
}

function obtenerHuecos() {
  return segmentos.filter(s => s.pid === null && s.tipo !== 'no-utilizable');
}

function seleccionarHueco(tamanoNecesario) {
  const candidatos = obtenerHuecos().filter(h => h.tamano >= tamanoNecesario);
  if (candidatos.length === 0) return null;
  if (algoritmo.value === 'best')  return candidatos.reduce((m, a) => a.tamano < m.tamano ? a : m);
  if (algoritmo.value === 'worst') return candidatos.reduce((m, a) => a.tamano > m.tamano ? a : m);
  return candidatos[0]; // first-fit
}

function colocarEnHueco(hueco, programa, iid) {
  const indice    = segmentos.indexOf(hueco);
  const proceso   = { id: `proceso-${iid}`, base: hueco.base, tamano: programa.tamano, pid: iid, tipo: 'proceso' };
  const sobrante  = hueco.tamano - programa.tamano;
  const nuevos    = [proceso];
  if (sobrante > 0) nuevos.push({ id: `${hueco.id}-restante`, base: hueco.base + programa.tamano, tamano: sobrante, pid: null, tipo: 'hueco' });
  segmentos.splice(indice, 1, ...nuevos);
}

function unirHuecosVecinos() {
  if (tipoParticion.value === 'fija' || tipoParticion.value === 'variable') return;
  for (let i = segmentos.length - 1; i > 0; i--) {
    if (segmentos[i].pid === null && segmentos[i - 1].pid === null) {
      segmentos[i - 1].tamano += segmentos[i].tamano;
      segmentos.splice(i, 1);
    }
  }
}

function compactarMemoria() {
  const procesos = segmentos.filter(s => s.pid !== null);
  let base = INICIO_USUARIO;
  segmentos = procesos.map(p => { const m = { ...p, base }; base += p.tamano; return m; });
  if (base < FIN_RAM) segmentos.push({ id: 'hueco-final', base, tamano: FIN_RAM - base, pid: null, tipo: 'hueco' });
}

// Recibe el iid de una instancia (no el pid del programa).
function asignarMemoriaParticion(iid) {
  const programa = obtenerProgramaDeInstancia(iid);
  let destino = null;

  if (tipoParticion.value === 'fija') {
    destino = segmentos.find(s => s.tipo === 'particion' && s.pid === null && s.tamano >= programa.tamano);
    if (destino) destino.pid = iid;
  } else if (tipoParticion.value === 'variable') {
    destino = seleccionarHueco(programa.tamano);
    if (destino) destino.pid = iid;
  } else {
    destino = seleccionarHueco(programa.tamano);
    if (destino) colocarEnHueco(destino, programa, iid);
  }

  if (!destino) {
    mostrarMensajeUsuario(`${iid} no cabe en ningún bloque libre.`);
    return false;
  }
  estados[iid] = 'En RAM';
  return true;
}

function liberarProceso_Particion(iid) {
  const seg = segmentos.find(s => s.pid === iid);
  if (!seg) return;
  seg.pid  = null;
  seg.tipo = tipoParticion.value === 'fija' || tipoParticion.value === 'variable' ? 'particion' : 'hueco';
  estados[iid] = 'Finalizado';
  unirHuecosVecinos();
  const esCompactada = tipoParticion.value === 'compactada';
  if (esCompactada) compactarMemoria();
  numeroEvento += 1;
  mostrarMensajeUsuario(esCompactada
    ? `${iid} liberó su espacio y la memoria se compactó automáticamente.`
    : `${iid} liberó su espacio en RAM.`);
  renderizarTodo();
}

function nombreAlgoritmo() {
  const m = modoActual();
  if (m === 'fija')        return 'asignación secuencial';
  if (m === 'compactada')  return 'ajuste secuencial (con compactación)';
  if (m === 'paginacion')  return 'paginación';
  if (m === 'segmentacion') return `segmentación · ${{ first:'First-Fit', best:'Best-Fit', worst:'Worst-Fit' }[algoritmo.value] || 'First-Fit'}`;
  return { first: 'First-Fit', best: 'Best-Fit', worst: 'Worst-Fit' }[algoritmo.value];
}

// ══════════════════════════════════════════════════════════
//  LÓGICA DE SEGMENTACIÓN
// ══════════════════════════════════════════════════════════

// Inicializa la RAM de segmentación como un único hueco libre.
function inicializarSegmentacion() {
  segmentosRam = [{
    base: INICIO_USUARIO,
    tamano: RAM_TOTAL - TAMANO_SO,
    pid: null,
    tipoSeg: 'hueco',
    indiceSegmento: -1,
  }];
}

// Devuelve los huecos libres del mapa de segmentación.
function obtenerHuecosSeg() {
  return segmentosRam.filter(s => s.pid === null);
}

// Elige el hueco adecuado para un segmento usando el algoritmo de ajuste seleccionado.
function seleccionarHuecoSeg(tamanoNecesario) {
  const candidatos = obtenerHuecosSeg().filter(h => h.tamano >= tamanoNecesario);
  if (candidatos.length === 0) return null;
  if (algoritmo.value === 'best')  return candidatos.reduce((m, a) => a.tamano < m.tamano ? a : m);
  if (algoritmo.value === 'worst') return candidatos.reduce((m, a) => a.tamano > m.tamano ? a : m);
  return candidatos[0]; // first-fit
}

// Inserta un segmento de tamaño `tamano` en el hueco dado y parte el sobrante.
function colocarSegmentoEnHueco(hueco, pid, tipoSeg, indiceSegmento, tamano) {
  const i = segmentosRam.indexOf(hueco);
  const nuevo = { base: hueco.base, tamano, pid, tipoSeg, indiceSegmento };
  const sobrante = hueco.tamano - tamano;
  const lista = [nuevo];
  if (sobrante > 0) lista.push({ base: hueco.base + tamano, tamano: sobrante, pid: null, tipoSeg: 'hueco', indiceSegmento: -1 });
  segmentosRam.splice(i, 1, ...lista);
  return nuevo;
}

// Une huecos vecinos en el mapa de segmentación (equivalente a unirHuecosVecinos).
function unirHuecosVecinosSeg() {
  for (let i = segmentosRam.length - 1; i > 0; i--) {
    if (segmentosRam[i].pid === null && segmentosRam[i - 1].pid === null) {
      segmentosRam[i - 1].tamano += segmentosRam[i].tamano;
      segmentosRam.splice(i, 1);
    }
  }
}

// Carga un programa en modo segmentación.
// Cada uno de sus tres segmentos (.text, .data, .bss) se coloca
// de forma INDEPENDIENTE usando el algoritmo de ajuste seleccionado.
// Recibe el iid de una instancia (no el pid del programa).
function asignarMemoriaSegmentacion(iid) {
  const programa  = obtenerProgramaDeInstancia(iid);
  const partes    = dividirEnSegmentos(programa.tamano); // [{tipo, tamano}, ...]
  const colocados = [];

  for (const parte of partes) {
    const hueco = seleccionarHuecoSeg(parte.tamano);
    if (!hueco) {
      // Si algún segmento no cabe, revertir los ya colocados
      colocados.forEach(c => {
        c.pid     = null;
        c.tipoSeg = 'hueco';
      });
      unirHuecosVecinosSeg();
      mostrarMensajeUsuario(`${iid} no cabe: el segmento ${parte.tipo} (${formatearTamano(parte.tamano)}) no tiene hueco disponible.`);
      return false;
    }
    const seg = colocarSegmentoEnHueco(hueco, iid, parte.tipo, TIPOS_SEGMENTO.findIndex(t => t.nombre === parte.tipo), parte.tamano);
    colocados.push(seg);
  }

  estados[iid] = 'En RAM';
  return true;
}

// Libera todos los segmentos de una instancia en modo segmentación.
function liberarProceso_Segmentacion(iid) {
  segmentosRam.forEach(s => {
    if (s.pid === iid) { s.pid = null; s.tipoSeg = 'hueco'; }
  });
  unirHuecosVecinosSeg();
  estados[iid] = 'Finalizado';
  numeroEvento += 1;
  mostrarMensajeUsuario(`${iid} liberó sus segmentos de RAM.`);
  renderizarTodo();
}

// ══════════════════════════════════════════════════════════
//  LÓGICA DE PAGINACIÓN
// ══════════════════════════════════════════════════════════

// Inicializa el MAPA DE BITS de marcos.
// mapaBitMarcos es un array de longitud = totalMarcosUsuario().
// Cada posición i representa el marco físico i:
//   { pid: null,   pagina: null }  → libre  (bit = 0)
//   { pid: 'P1',   pagina: 3    }  → ocupado (bit = 1)
function inicializarPaginacion() {
  const total = totalMarcosUsuario();
  // Llenamos todos los marcos con el valor "libre" (bit = 0)
  mapaBitMarcos = Array.from({ length: total }, () => ({ pid: null, pagina: null }));
  tablaDePagesPorPid.clear();
  ultimoCargadoPag = null;
}

// Devuelve los índices de los marcos libres (bit = 0).
function obtenerMarcosLibres() {
  return mapaBitMarcos.reduce((acc, m, i) => {
    if (m.pid === null) acc.push(i);
    return acc;
  }, []);
}

// Carga un programa en modo paginación.
// Divide el programa en segmentos, luego en páginas, y asigna
// un marco libre por página (cualquier marco sirve; no hay First/Best/Worst).
// Recibe el iid de una instancia (no el pid del programa).
function asignarMemoriaPaginacion(iid) {
  const programa       = obtenerProgramaDeInstancia(iid);
  const tamPagina      = tamanoMarcoBytesActual();
  const partesSeg      = dividirEnSegmentos(programa.tamano);
  const marcosLibres   = obtenerMarcosLibres();

  // Calcular cuántas páginas necesita cada segmento
  // (ceil porque la última página puede no llenarse → fragmentación interna)
  const paginasPorSeg = partesSeg.map(seg => ({
    tipo:    seg.tipo,
    tamano:  seg.tamano,
    paginas: Math.ceil(seg.tamano / tamPagina),
  }));

  const paginasTotales = paginasPorSeg.reduce((s, x) => s + x.paginas, 0);

  if (paginasTotales > marcosLibres.length) {
    mostrarMensajeUsuario(`${iid} no cabe: necesita ${paginasTotales} marcos pero solo hay ${marcosLibres.length} libres.`);
    return false;
  }

  // Asignar marcos a páginas (tomar los primeros disponibles del mapa de bits)
  let marcosUsados     = 0;
  let numeroPaginaGlobal = 0;
  const entradasPagina = [];

  for (const seg of paginasPorSeg) {
    for (let p = 0; p < seg.paginas; p++) {
      const marco = marcosLibres[marcosUsados]; // bit 0 → pasa a bit 1
      mapaBitMarcos[marco] = { pid: iid, pagina: numeroPaginaGlobal };
      entradasPagina.push({ pagina: numeroPaginaGlobal, marco, tipoSeg: seg.tipo, presente: 1 });
      marcosUsados++;
      numeroPaginaGlobal++;
    }
  }

  tablaDePagesPorPid.set(iid, entradasPagina);

  // Guardar datos de la última instancia para el panel de cálculo
  const fragInterna = paginasTotales * tamPagina - programa.tamano;
  ultimoCargadoPag = {
    pid:           iid,
    nombre:        programa.nombre,
    tamanoTotal:   programa.tamano,
    tamPagina,
    segmentos:     paginasPorSeg,
    paginasTotales,
    fragInterna,
  };

  estados[iid] = 'En RAM';
  return true;
}

// Libera todos los marcos de una instancia del MAPA DE BITS (bit 1 → bit 0).
function liberarProceso_Paginacion(iid) {
  // Recorrer el mapa de bits y poner a libre cada marco de la instancia
  mapaBitMarcos.forEach((marco, i) => {
    if (marco.pid === iid) mapaBitMarcos[i] = { pid: null, pagina: null };
  });
  tablaDePagesPorPid.delete(iid);
  // Si la instancia liberada era la del panel de cálculo, limpiarlo
  if (ultimoCargadoPag && ultimoCargadoPag.pid === iid) ultimoCargadoPag = null;
  estados[iid] = 'Finalizado';
  numeroEvento += 1;
  mostrarMensajeUsuario(`${iid} liberó sus marcos de página.`);
  renderizarTodo();
}

// ══════════════════════════════════════════════════════════
//  PUNTO DE ENTRADA UNIFICADO: asignarMemoria / liberarProceso
// ══════════════════════════════════════════════════════════
// Carga una NUEVA instancia del programa indicado por su pid de catálogo.
// Cada llamada crea una instancia distinta (así Word puede abrirse 2+ veces).
function asignarMemoria(programaPid) {
  // Creamos la instancia primero; si la asignación falla, la descartamos.
  const iid = crearInstancia(programaPid);
  let exito = false;
  if (esModoSegmentacion()) {
    exito = asignarMemoriaSegmentacion(iid);
  } else if (esModoPaginacion()) {
    exito = asignarMemoriaPaginacion(iid);
  } else {
    exito = asignarMemoriaParticion(iid);
  }
  if (exito) {
    numeroEvento += 1;
    mostrarMensajeUsuario(`${iid} fue asignado mediante ${nombreAlgoritmo()}.`);
    renderizarTodo();
  } else {
    // Revertir: quitar la instancia que no llegó a cargarse
    instancias = instancias.filter(i => i.iid !== iid);
    delete estados[iid];
    renderizarTodo();
  }
  return exito;
}

// Libera una instancia concreta por su iid.
function liberarProceso(iid) {
  if (esModoSegmentacion()) {
    liberarProceso_Segmentacion(iid);
  } else if (esModoPaginacion()) {
    liberarProceso_Paginacion(iid);
  } else {
    liberarProceso_Particion(iid);
  }
}

// ══════════════════════════════════════════════════════════
//  CONTROL DE LA SIMULACIÓN
// ══════════════════════════════════════════════════════════
function reiniciarSimulacion(mostrarMsg = true) {
  detenerSimulacion(false);
  simulacionIniciada = false;
  // Inicializar la estructura correcta según el modo activo
  if (esModoSegmentacion()) {
    inicializarSegmentacion();
  } else if (esModoPaginacion()) {
    inicializarPaginacion();
  } else {
    segmentos = crearMemoriaInicial();
  }
  estados            = {};
  instancias         = [];   // al reiniciar no hay ninguna instancia cargada
  contadorInstancias = {};
  numeroEvento = 0;
  sincronizarControles();
  renderizarTodo();
  if (mostrarMsg) mostrarMensajeUsuario('Memoria reiniciada. Todos los procesos están esperando.');
}

function sincronizarControles() {
  const modo = modoActual();
  const esFija       = modo === 'fija';
  const esCompactada = modo === 'compactada';
  const esPag        = modo === 'paginacion';
  const esSeg        = modo === 'segmentacion';

  // El algoritmo no aplica para fija, compactada ni paginación
  const sinAlgoritmo = esFija || esCompactada || esPag;
  algoritmo.disabled = sinAlgoritmo;
  if (sinAlgoritmo) algoritmo.value = 'secuencial';
  else if (algoritmo.value === 'secuencial') algoritmo.value = 'first';

  tamanoParticionFija.hidden = !esFija;
  tamanoPaginaSelect.hidden  = !esPag;

  // Mostrar/ocultar vistas de tablas
  vistaParticiones.hidden  = esPag || esSeg;
  vistaSegmentacion.hidden = !esSeg;
  vistaPaginacion.hidden   = !esPag;

  // La sección del Mapa de marcos (4.ª columna) solo existe en paginación.
  // La clase en <body> activa el grid de 4 columnas definido en el CSS.
  seccionMapaMarcos.hidden = !esPag;
  document.body.classList.toggle('modo-paginacion', esPag);
}

function iniciarSimulacion() {
  if (simulacionActiva) return;
  simulacionActiva   = true;
  simulacionIniciada = true;
  iniciar.disabled   = true;
  detener.disabled   = false;
  mostrarMensajeUsuario('Simulación iniciada. Puedes cargar o liberar programas cuando quieras.');
  renderizarTodo();
}

function detenerSimulacion(mostrar = true) {
  simulacionActiva = false;
  iniciar.disabled  = false;
  detener.disabled  = true;
  if (mostrar) mostrarMensajeUsuario('Simulación detenida. Aún puedes cargar o liberar programas manualmente.');
}

// ══════════════════════════════════════════════════════════
//  RENDERIZADO — LISTA DE PROGRAMAS
// ══════════════════════════════════════════════════════════
function renderizarProgramas() {
  listaProgramas.innerHTML = '';
  programas.forEach(programa => {
    // La tarjeta ahora es el contenedor flex-column directo de la lista.
    // El botón de eliminar vive DENTRO de la tarjeta (en el encabezado),
    // por lo que ya no se necesita el wrapper .fila-programa.
    const tarjeta = document.createElement('article');
    tarjeta.className = 'programa';
    tarjeta.style.setProperty('--color-programa', programa.color);

    // Instancias vivas de este programa (puede haber 0, 1 o varias).
    const vivas  = instanciasEnRam(programa.pid);
    const estado = vivas.length > 0 ? `${vivas.length} en RAM` : 'Esperando';

    // Mini-chips de segmentos (.text / .data / .bss) solo para la UI.
    const partes = dividirEnSegmentos(programa.tamano);
    const chipsHTML = partes
      .map(p => `<span class="seg-chip">${p.tipo} ${(p.tamano / 1024).toFixed(1)}K</span>`)
      .join('');

    // Lista de instancias cargadas, cada una con su propio botón "Liberar".
    const instanciasHTML = vivas.length === 0
      ? ''
      : `<div class="instancias-lista">
          ${vivas.map(inst => `
            <div class="instancia-fila">
              <span class="instancia-id">${inst.iid}</span>
              <button type="button" class="liberar-instancia" data-iid="${inst.iid}">Liberar</button>
            </div>`).join('')}
         </div>`;

    // Estructura:
    //   1. Encabezado  → PID + nombre (izquierda) · papelera (derecha)
    //   2. Segmentos   → píldoras
    //   3. Instancias  → una fila por copia cargada, con su botón Liberar
    //   4. Pie         → estado (nº en RAM) · botón "Cargar" (nueva instancia)
    tarjeta.innerHTML = `
      <div class="programa-encabezado">
        <div class="programa-identidad">
          <span class="pid-programa">${programa.pid}</span>
          <div class="programa-textos">
            <strong class="programa-nombre">${programa.nombre}</strong>
            <small class="programa-tamano">${programa.tamano.toLocaleString('es-CO')} bytes</small>
          </div>
        </div>
        <button type="button" class="eliminar-programa"
                title="Eliminar programa"
                aria-label="Eliminar ${programa.nombre} (${programa.pid})">🗑</button>
      </div>
      <div class="segmentos-mini">${chipsHTML}</div>
      ${instanciasHTML}
      <div class="programa-pie">
        <span class="estado">${estado}</span>
        <button type="button" class="accion-programa">Cargar</button>
      </div>
    `;

    // "Cargar" siempre crea una nueva instancia del programa.
    tarjeta.querySelector('.accion-programa').addEventListener('click', () => {
      asignarMemoria(programa.pid);
    });
    // Cada botón "Liberar" libera su instancia concreta (por iid).
    tarjeta.querySelectorAll('.liberar-instancia').forEach(boton => {
      boton.addEventListener('click', () => liberarProceso(boton.dataset.iid));
    });
    tarjeta.querySelector('.eliminar-programa').addEventListener('click', () => eliminarPrograma(programa.pid));

    listaProgramas.appendChild(tarjeta);
  });
}

// ══════════════════════════════════════════════════════════
//  RENDERIZADO — MODO PARTICIONES
// ══════════════════════════════════════════════════════════
function renderizarTabla() {
  tablaParticiones.innerHTML = '';
  if (!simulacionIniciada) {
    tablaParticiones.innerHTML = '<tr><td colspan="6" class="tabla-vacia">Inicia la simulación para ver la memoria.</td></tr>';
    return;
  }
  segmentos.forEach(seg => {
    const programa   = seg.pid ? obtenerProgramaDeInstancia(seg.pid) : null;
    const esNoUtil   = seg.tipo === 'no-utilizable';
    const esParticion = tipoParticion.value === 'fija' || tipoParticion.value === 'variable';
    const fragInt    = programa && esParticion ? seg.tamano - programa.tamano : 0;
    const fragExt    = !programa && !esParticion && !esNoUtil ? seg.tamano : 0;
    const clase      = programa ? 'ocupado' : esNoUtil ? 'no-utilizable' : 'libre';
    const texto      = programa ? `${seg.pid} / ${programa.nombre}` : esNoUtil ? 'No utilizable' : 'Libre';
    const codigo     = programa ? 'O' : esNoUtil ? '—' : 'L';
    const fila       = document.createElement('tr');
    fila.innerHTML = `
      <td class="${clase}">${texto}</td>
      <td>${codigo}</td>
      <td>${formatearHex(seg.base)}</td>
      <td>${formatearTamano(seg.tamano)}</td>
      <td>${formatearTamano(fragInt)}</td>
      <td>${formatearTamano(fragExt)}</td>
    `;
    tablaParticiones.appendChild(fila);
  });
}

function renderizarTablaFragmentos() {
  const mostrar = simulacionIniciada && tipoParticion.value === 'dinamica';
  tablaFragmentosContenedor.hidden = !mostrar;
  if (!mostrar) return;
  tablaFragmentos.innerHTML = '';
  obtenerHuecos().forEach((h, i) => {
    const fila = document.createElement('tr');
    fila.innerHTML = `<td>Fragmento ${i + 1}</td><td>${formatearHex(h.base)}</td><td>${formatearTamano(h.tamano)}</td>`;
    tablaFragmentos.appendChild(fila);
  });
}

// ══════════════════════════════════════════════════════════
//  RENDERIZADO — MODO SEGMENTACIÓN
// ══════════════════════════════════════════════════════════
function renderizarTablaSegmentacion() {
  tablaSegmentos.innerHTML = '';
  tablaFragmentosSeg.innerHTML = '';

  if (!simulacionIniciada) {
    tablaSegmentos.innerHTML = '<tr><td colspan="9" class="tabla-vacia">Inicia la simulación para ver los segmentos.</td></tr>';
    return;
  }

  let numeroSegmentoGlobal = 0; // número de segmento incremental para toda la tabla
  let segsCargados = 0;

  segmentosRam.forEach(seg => {
    if (seg.pid === null) {
      // Es un hueco libre → tabla de fragmentos
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${seg.base.toLocaleString()}</td>
        <td>${formatearHex(seg.base)}</td>
        <td>${formatearTamano(seg.tamano)}</td>
      `;
      tablaFragmentosSeg.appendChild(fila);
      return;
    }

    const programa = obtenerProgramaDeInstancia(seg.pid);
    const info     = TIPOS_SEGMENTO.find(t => t.nombre === seg.tipoSeg) || { permisos: '---' };
    const limite   = seg.tamano; // el límite es el tamaño del segmento (offset máximo)

    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td class="ocupado">${seg.pid}</td>
      <td>${numeroSegmentoGlobal}</td>
      <td>${formatearHex(numeroSegmentoGlobal)}</td>
      <td>${seg.base.toLocaleString()}</td>
      <td>${formatearHex(seg.base)}</td>
      <td>${limite.toLocaleString()}</td>
      <td>${formatearHex(limite)}</td>
      <td><code>${info.permisos}</code></td>
      <td>${seg.tipoSeg}</td>
    `;
    tablaSegmentos.appendChild(fila);
    numeroSegmentoGlobal++;
    segsCargados++;
  });

  // Calcular uso para el resumen
  const totalUsuario = RAM_TOTAL - TAMANO_SO;
  const usados = segmentosRam.filter(s => s.pid !== null).reduce((acc, s) => acc + s.tamano, 0);
  resumenSegOcupacion.textContent = `RAM de usuario: ${((usados / totalUsuario) * 100).toFixed(1)}% ocupada`;
  resumenSegSegs.textContent      = `Segmentos cargados: ${segsCargados}`;

  if (tablaFragmentosSeg.children.length === 0) {
    tablaFragmentosSeg.innerHTML = '<tr><td colspan="3" class="tabla-vacia">Sin fragmentos libres.</td></tr>';
  }
}

// ══════════════════════════════════════════════════════════
//  RENDERIZADO — MODO PAGINACIÓN
// ══════════════════════════════════════════════════════════
function renderizarTablaPaginacion() {
  tablaPaginas.innerHTML = '';
  mapaBitsContenedor.innerHTML = '';

  if (!simulacionIniciada) {
    tablaPaginas.innerHTML = '<tr><td colspan="7" class="tabla-vacia">Inicia la simulación para ver las páginas.</td></tr>';
    return;
  }

  // ── Tabla de páginas ──
  tablaDePagesPorPid.forEach((entradas, iid) => {
    entradas.forEach(e => {
      const addrMarco = INICIO_USUARIO + e.marco * tamanoMarcoBytesActual();
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td class="ocupado">${iid}</td>
        <td>${e.pagina}</td>
        <td>${formatearHex(e.pagina)}</td>
        <td>${e.marco}</td>
        <td>${formatearHex(addrMarco)}</td>
        <td>${e.presente ? '✔ Presente' : '✘ Ausente'}</td>
        <td>${e.tipoSeg}</td>
      `;
      tablaPaginas.appendChild(fila);
    });
  });

  if (tablaPaginas.children.length === 0) {
    tablaPaginas.innerHTML = '<tr><td colspan="7" class="tabla-vacia">No hay procesos cargados.</td></tr>';
  }

  // ── Mapa de bits de marcos ──
  // Cada celda representa un marco: 0 = libre (fondo claro), 1 = ocupado (color del proceso).
  // El tooltip muestra el número de marco en Dec y Hex más su estado.
  //   Ocupado →  "Marco 16 (0x0010) - Ocupado: P1 (.text)"
  //   Libre   →  "Marco 25 (0x0019) - Libre"
  mapaBitMarcos.forEach((marco, i) => {
    const celda = document.createElement('div');
    celda.className = 'bit-marco';
    // Hex corto de 4 dígitos para el número de marco, como en el ejemplo pedido
    const marcoHex = `0x${i.toString(16).toUpperCase().padStart(4, '0')}`;

    let tooltip;
    if (marco.pid !== null) {
      const prog = obtenerProgramaDeInstancia(marco.pid);
      // Buscar a qué segmento (.text/.data/.bss) pertenece esta página de la instancia
      const entradas = tablaDePagesPorPid.get(marco.pid) || [];
      const entrada  = entradas.find(e => e.marco === i);
      const seg      = entrada ? ` (${entrada.tipoSeg})` : '';
      celda.classList.add('ocupado');
      celda.style.background = prog ? prog.color : '#888';
      celda.textContent = '1';
      tooltip = `Marco ${i} (${marcoHex}) - Ocupado: ${marco.pid}${seg}`;
    } else {
      celda.textContent = '0';
      tooltip = `Marco ${i} (${marcoHex}) - Libre`;
    }
    celda.setAttribute('data-tip', tooltip); // fuente de datos del tooltip flotante
    // Listeners del tooltip flotante (position: fixed → no se recorta por overflow)
    celda.addEventListener('mouseenter', e => mostrarTooltipMarco(tooltip, e));
    celda.addEventListener('mousemove',  e => posicionarTooltipMarco(e));
    celda.addEventListener('mouseleave', ocultarTooltipMarco);
    mapaBitsContenedor.appendChild(celda);
  });

  // ── Panel de cálculo ──
  if (ultimoCargadoPag) {
    calculoPaginacionContenedor.hidden = false;
    tablaCalculoPaginacion.innerHTML   = '';
    const u = ultimoCargadoPag;
    const filas = [
      ['Proceso', `${u.pid} — ${u.nombre}`],
      ['Tamaño total del proceso', `${u.tamanoTotal.toLocaleString()} bytes (${formatearTamano(u.tamanoTotal)})`],
      ['Tamaño de página / marco', `${u.tamPagina} bytes (${formatearTamano(u.tamPagina)})`],
      ...u.segmentos.map(s => [
        `Segmento ${s.tipo}`,
        `${formatearTamano(s.tamano)} → ⌈${s.tamano} / ${u.tamPagina}⌉ = ${s.paginas} página${s.paginas !== 1 ? 's' : ''}`,
      ]),
      ['Total de páginas asignadas', `${u.paginasTotales} páginas`],
      ['Fragmentación interna', `${u.fragInterna.toLocaleString()} bytes (${formatearTamano(u.fragInterna)})`],
    ];
    filas.forEach(([campo, valor]) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `<td><strong>${campo}</strong></td><td>${valor}</td>`;
      tablaCalculoPaginacion.appendChild(fila);
    });
  } else {
    calculoPaginacionContenedor.hidden = true;
  }

  // ── Resumen ──
  const libres = mapaBitMarcos.filter(m => m.pid === null).length;
  const total  = mapaBitMarcos.length;
  const usados = total - libres;
  const tamPag = tamanoMarcoBytesActual();
  const pctUso = total > 0 ? ((usados / total) * 100).toFixed(1) : '0.0';
  resumenPagOcupacion.textContent = `RAM de usuario: ${pctUso}% ocupada`;
  resumenPagMarcos.textContent    = `Marcos libres: ${libres} / ${total}`;
}

// ══════════════════════════════════════════════════════════
//  RENDERIZADO — VISUALIZACIÓN RAM (columna derecha)
// ══════════════════════════════════════════════════════════
function renderizarRAM() {
  ram.innerHTML = '';

  if (!simulacionIniciada) {
    const vacio = document.createElement('div');
    vacio.className  = 'ram-vacia';
    vacio.textContent = 'Inicia la simulación para ver la memoria.';
    ram.appendChild(vacio);
    return;
  }

  const modo = modoActual();

  // ── Bloque del SO (siempre en la base) ──
  const bloqSO = document.createElement('div');
  bloqSO.className = 'bloque-ram so';
  bloqSO.style.height = `${(TAMANO_SO / RAM_TOTAL) * 100}%`;
  bloqSO.innerHTML = '<strong>Sistema Operativo</strong><span>0x000000 – 0x0FFFFF</span>';
  // Se añade al final porque la RAM usa column-reverse (SO queda abajo)

  if (modo === 'paginacion') {
    // ── Vista por MARCO (como particiones estáticas) ──
    // Cada marco ocupado se dibuja como su propio bloque, mostrando su
    // dirección base en hexadecimal y qué contiene (p. ej. "P1 .text").
    // Los marcos LIBRES contiguos sí se fusionan en un único bloque "Libre"
    // para no generar miles de filas vacías (16 MiB / 4 KiB ≈ 3840 marcos).
    ram.classList.remove('ram-grid');
    ram.classList.add('ram');

    const tamMarco = tamanoMarcoBytesActual();
    const bloques  = [];

    mapaBitMarcos.forEach((marco, i) => {
      const base = INICIO_USUARIO + i * tamMarco;

      if (marco.pid === null) {
        // Marco libre → fusionar con el bloque libre anterior si lo hay
        const ultimo = bloques[bloques.length - 1];
        if (ultimo && ultimo.libre) {
          ultimo.tamano  += tamMarco;
          ultimo.marcos  += 1;
        } else {
          bloques.push({ libre: true, base, tamano: tamMarco, marcos: 1 });
        }
        return;
      }

      // Marco ocupado → un bloque individual por marco.
      // Averiguar a qué segmento (.text/.data/.bss) pertenece esta página.
      const entradas = tablaDePagesPorPid.get(marco.pid) || [];
      const entrada  = entradas.find(e => e.marco === i);
      const tipoSeg  = entrada ? entrada.tipoSeg : '';
      bloques.push({
        libre:   false,
        base,
        tamano:  tamMarco,
        pid:     marco.pid,
        pagina:  marco.pagina,
        marcoNum: i,
        tipoSeg,
      });
    });

    bloques.forEach(bloque => {
      const elem = document.createElement('div');

      if (bloque.libre) {
        elem.className = 'bloque-ram libre';
        elem.style.height = `${(bloque.tamano / RAM_TOTAL) * 100}%`;
        elem.innerHTML = `<strong>Libre</strong><span>${formatearHex(bloque.base)} · ${bloque.marcos} marco${bloque.marcos !== 1 ? 's' : ''} · ${formatearTamano(bloque.tamano)}</span>`;
        ram.appendChild(elem);
        return;
      }

      const program = obtenerProgramaDeInstancia(bloque.pid);
      // La clase seg-text/seg-data/seg-bss varía el brillo del color del
      // programa para diferenciar visualmente los segmentos (igual que en
      // el modo Segmentación).
      const claseSeg = bloque.tipoSeg ? `seg-${bloque.tipoSeg.replace('.', '')}` : '';
      elem.className = `bloque-ram ${claseSeg}`;
      elem.style.height = `${(bloque.tamano / RAM_TOTAL) * 100}%`;
      if (program) elem.style.background = program.color;
      elem.innerHTML = `
        <strong>${bloque.pid} ${bloque.tipoSeg}</strong>
        <span>${formatearHex(bloque.base)} · Marco ${bloque.marcoNum} · Pág. ${bloque.pagina}</span>
      `;
      ram.appendChild(elem);
    });

    ram.appendChild(bloqSO);

  } else if (modo === 'segmentacion') {
    // ── Vista de bloques con variación de opacidad por tipo de segmento ──
    ram.classList.remove('ram-grid');
    ram.classList.add('ram');

    const bloques = [{ base: 0, tamano: TAMANO_SO, pid: 'SO', tipoSeg: 'so' }, ...segmentosRam];
    bloques.forEach(bloque => {
      const elem    = document.createElement('div');
      const program = bloque.pid !== 'SO' && bloque.pid ? obtenerProgramaDeInstancia(bloque.pid) : null;
      elem.className = `bloque-ram ${bloque.tipoSeg === 'so' ? 'so' : program ? `seg-${bloque.tipoSeg.replace('.', '')}` : 'libre'}`;
      elem.style.height = `${(bloque.tamano / RAM_TOTAL) * 100}%`;
      if (program) {
        // Aplicar el color del programa; la clase seg-text/seg-data/seg-bss varía el brillo
        elem.style.background = program.color;
      }
      if (bloque.tipoSeg === 'so') {
        elem.innerHTML = '<strong>Sistema Operativo</strong><span>0x000000 – 0x0FFFFF</span>';
      } else if (program) {
        elem.innerHTML = `<strong>${bloque.pid} ${bloque.tipoSeg}</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`;
      } else {
        elem.innerHTML = `<strong>Libre</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`;
      }
      ram.appendChild(elem);
    });

  } else {
    // ── Vista estándar de particiones ──
    ram.classList.remove('ram-grid');
    ram.classList.add('ram');

    const bloques = [{ base: 0, tamano: TAMANO_SO, pid: 'SO', tipo: 'so' }, ...segmentos];
    bloques.forEach(bloque => {
      const elem    = document.createElement('div');
      const program = bloque.pid !== 'SO' && bloque.pid ? obtenerProgramaDeInstancia(bloque.pid) : null;
      const esNoUtil = bloque.tipo === 'no-utilizable';
      elem.className = `bloque-ram ${bloque.tipo === 'so' ? 'so' : program ? '' : esNoUtil ? 'no-utilizable' : 'libre'}`;
      elem.style.height = `${(bloque.tamano / RAM_TOTAL) * 100}%`;
      if (program) elem.style.background = program.color;
      elem.innerHTML = bloque.pid === 'SO'
        ? '<strong>Sistema Operativo</strong><span>0x000000 – 0x0FFFFF (base de la RAM)</span>'
        : program
          ? `<strong>${bloque.pid} / ${program.nombre}</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`
          : esNoUtil
            ? `<strong>No utilizable</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`
            : `<strong>Libre</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`;
      ram.appendChild(elem);
    });
  }
}

// ── Resumen de uso de RAM ──────────────────────────────────
function renderizarResumen() {
  reloj.textContent = `Evento ${numeroEvento}`;
  if (!simulacionIniciada) {
    resumenOcupacion.textContent   = 'RAM de usuario: — % ocupada';
    resumenHuecos.textContent      = 'Huecos libres: —';
    ramUsoRelleno.style.width      = '0%';
    ramUsoPorcentaje.textContent   = '0.0%';
    ramUsoDisponible.textContent   = 'RAM disponible: —';
    return;
  }

  const totalUsuario = RAM_TOTAL - TAMANO_SO;
  let usados = 0;

  if (esModoPaginacion()) {
    const tamPag = tamanoMarcoBytesActual();
    usados = mapaBitMarcos.filter(m => m.pid !== null).length * tamPag;
  } else if (esModoSegmentacion()) {
    usados = segmentosRam.filter(s => s.pid !== null).reduce((a, s) => a + s.tamano, 0);
  } else {
    usados = segmentos.filter(s => s.pid !== null).reduce((a, s) => a + s.tamano, 0);
  }

  const disponible       = totalUsuario - usados;
  const pctUsuario       = ((usados / totalUsuario) * 100).toFixed(1);
  const pctGlobal        = (((TAMANO_SO + usados) / RAM_TOTAL) * 100).toFixed(1);
  resumenOcupacion.textContent = `RAM de usuario: ${pctUsuario}% ocupada`;
  resumenHuecos.textContent    = esModoParticiones()
    ? `Huecos libres: ${obtenerHuecos().length}`
    : esModoSegmentacion()
      ? `Fragmentos libres: ${obtenerHuecosSeg().length}`
      : `Marcos libres: ${obtenerMarcosLibres().length}`;
  ramUsoRelleno.style.width    = `${pctGlobal}%`;
  ramUsoPorcentaje.textContent = `${pctGlobal}%`;
  ramUsoDisponible.textContent = `RAM disponible: ${(disponible / 1024).toFixed(1)} KiB`;
}

// ── Renderizado global ────────────────────────────────────
function renderizarTodo() {
  renderizarProgramas();

  if (esModoSegmentacion()) {
    renderizarTablaSegmentacion();
  } else if (esModoPaginacion()) {
    renderizarTablaPaginacion();
  } else {
    renderizarTabla();
    renderizarTablaFragmentos();
  }

  renderizarRAM();
  renderizarResumen();
}

// ══════════════════════════════════════════════════════════
//  EVENTOS
// ══════════════════════════════════════════════════════════
tipoParticion.addEventListener('change', () => {
  reiniciarSimulacion(false);
  mostrarMensajeUsuario('Modo de gestión cambiado. La memoria volvió a su estado inicial.');
});

tamanoParticionFija.addEventListener('change', () => {
  const kib = Number(tamanoParticionFija.value);
  if (!Number.isFinite(kib) || kib <= 0) {
    mostrarMensajeUsuario('El tamaño de partición debe ser un número mayor a 0, en KiB.');
    return;
  }
  reiniciarSimulacion(false);
  mostrarMensajeUsuario(`Tamaño de partición fija: ${formatearTamano(obtenerTamanoParticionFijaBytes())}. Memoria reiniciada.`);
});

tamanoPaginaSelect.addEventListener('change', () => {
  reiniciarSimulacion(false);
  mostrarMensajeUsuario(`Tamaño de página cambiado a ${formatearTamano(tamanoMarcoBytesActual())}. Memoria reiniciada.`);
});

algoritmo.addEventListener('change', () => {
  mostrarMensajeUsuario(`Algoritmo seleccionado: ${nombreAlgoritmo()}.`);
});

iniciar.addEventListener('click', iniciarSimulacion);
detener.addEventListener('click', () => detenerSimulacion(true));
reiniciar.addEventListener('click', () => reiniciarSimulacion(true));
agregarProgramaBoton.addEventListener('click', agregarPrograma);

// Estado inicial visible al abrir el archivo.
reiniciarSimulacion(false);
