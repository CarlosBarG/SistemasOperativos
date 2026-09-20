// Todas las cantidades se manejan en bytes para evitar errores de redondeo.
const MIB = 1024 * 1024;
const RAM_TOTAL = 16 * MIB;
const TAMANO_SO = 1 * MIB;
const INICIO_USUARIO = TAMANO_SO;
const FIN_RAM = RAM_TOTAL;

// Programas incluidos en el ejercicio y procesos adicionales para probar la capacidad.
const programas = [
  { pid: 'P1', nombre: 'Notepad', tamano: 224649, color: 'var(--p1)' },
  { pid: 'P2', nombre: 'Word', tamano: 286708, color: 'var(--p2)' },
  { pid: 'P3', nombre: 'Excel', tamano: 309150, color: 'var(--p3)' },
  { pid: 'P4', nombre: 'AutoCAD', tamano: 436201, color: 'var(--p4)' },
  { pid: 'P5', nombre: 'Calculadora', tamano: 209462, color: 'var(--p5)' },
  { pid: 'P6', nombre: 'Adobe Premiere Pro', tamano: 3996608, color: 'var(--p6)' },
  { pid: 'P7', nombre: 'Visual Studio Code', tamano: 1785608, color: 'var(--p7)' },
  { pid: 'P8', nombre: 'Blender', tamano: 2696608, color: 'var(--p8)' },
  { pid: 'P9', nombre: 'Apache HTTP Server', tamano: 1572864, color: 'var(--p9)' },
  { pid: 'P10', nombre: 'MySQL Server', tamano: 1310720, color: 'var(--p10)' },
  { pid: 'P11', nombre: 'Google Chrome', tamano: 1835008, color: 'var(--p11)' },
  { pid: 'P12', nombre: 'Eclipse IDE', tamano: 1048576, color: 'var(--p12)' },
  { pid: 'P13', nombre: '7-Zip', tamano: 131072, color: 'var(--p13)' }
];

const tipoParticion = document.querySelector('#tipo-particion');
const algoritmo = document.querySelector('#algoritmo');
const listaProgramas = document.querySelector('#lista-programas');
const tablaParticiones = document.querySelector('#tabla-particiones');
const ram = document.querySelector('#ram');
const mensaje = document.querySelector('#mensaje');
const reloj = document.querySelector('#reloj');
const iniciar = document.querySelector('#iniciar');
const detener = document.querySelector('#detener');
const reiniciar = document.querySelector('#reiniciar');
const compactar = document.querySelector('#compactar');
const resumenOcupacion = document.querySelector('#resumen-ocupacion');
const resumenHuecos = document.querySelector('#resumen-huecos');

let segmentos = [];
let estados = {};
let numeroEvento = 0;
let temporizador = null;
let colaFinalizacion = [];

// Convierte bytes a una unidad legible para mostrarla en la interfaz.
function formatearTamano(bytes) {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

// Mantiene siempre seis dígitos hexadecimales, como en el enunciado.
function formatearHex(numero) {
  return `0x${numero.toString(16).toUpperCase().padStart(6, '0')}`;
}

function obtenerPrograma(pid) {
  return programas.find(programa => programa.pid === pid);
}

// Crea una lista de particiones consecutivas con tamaños ya definidos.
function crearParticionesEstaticas(tamanos) {
  let base = INICIO_USUARIO;
  return tamanos.map((tamano, indice) => {
    const particion = { id: `particion-${indice + 1}`, base, tamano, pid: null, tipo: 'particion' };
    base += tamano;
    return particion;
  });
}

// Reinicia la estructura de memoria según el tipo elegido en el selector.
function crearMemoriaInicial() {
  if (tipoParticion.value === 'fija') return crearParticionesEstaticas(Array(15).fill(MIB));
  if (tipoParticion.value === 'variable') {
    return crearParticionesEstaticas([
      512 * 1024, 1 * MIB, 2 * MIB, 4 * MIB,
      512 * 1024, 1 * MIB, 2 * MIB, 4 * MIB
    ]);
  }
  return [{ id: 'hueco-inicial', base: INICIO_USUARIO, tamano: RAM_TOTAL - TAMANO_SO, pid: null, tipo: 'hueco' }];
}

// Carga todos los programas en estado de espera y deja libre la memoria de usuario.
function reiniciarSimulacion(mostrarMensaje = true) {
  detenerSimulacion(false);
  segmentos = crearMemoriaInicial();
  estados = {};
  colaFinalizacion = [];
  numeroEvento = 0;
  programas.forEach(programa => { estados[programa.pid] = 'Esperando'; });
  sincronizarSelectorAlgoritmo();
  renderizarTodo();
  if (mostrarMensaje) mostrarMensajeUsuario('Memoria reiniciada. Todos los procesos están esperando.');
}

// El algoritmo no aplica a particiones fijas porque todos los bloques miden lo mismo.
function sincronizarSelectorAlgoritmo() {
  const esFija = tipoParticion.value === 'fija';
  algoritmo.disabled = esFija;
  algoritmo.value = esFija ? 'secuencial' : (algoritmo.value === 'secuencial' ? 'first' : algoritmo.value);
  compactar.classList.toggle('visible', tipoParticion.value === 'compactada');
}

function mostrarMensajeUsuario(texto) {
  mensaje.textContent = texto;
}

// Dibuja la lista izquierda y agrega una acción manual por proceso.
function renderizarProgramas() {
  listaProgramas.innerHTML = '';
  programas.forEach(programa => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'programa';
    tarjeta.style.setProperty('--color-programa', programa.color);
    const estado = estados[programa.pid];
    const accion = estado === 'En RAM' ? 'Liberar' : estado === 'Finalizado' ? 'Cargar' : 'Asignar';
    tarjeta.innerHTML = `
      <strong>${programa.pid}</strong>
      <div><strong>${programa.nombre}</strong><small>${programa.tamano.toLocaleString('es-CO')} bytes</small><span class="estado">${estado}</span></div>
      <button type="button">${accion}</button>
    `;
    tarjeta.querySelector('button').addEventListener('click', () => {
      if (estado === 'En RAM') liberarProceso(programa.pid);
      else asignarMemoria(programa.pid);
    });
    listaProgramas.appendChild(tarjeta);
  });
}

function obtenerHuecos() {
  return segmentos.filter(segmento => segmento.pid === null);
}

// Elige el hueco según First-Fit, Best-Fit o Worst-Fit.
function seleccionarHueco(tamanoNecesario) {
  const candidatos = obtenerHuecos().filter(hueco => hueco.tamano >= tamanoNecesario);
  if (candidatos.length === 0) return null;
  if (algoritmo.value === 'best') return candidatos.reduce((menor, actual) => actual.tamano < menor.tamano ? actual : menor);
  if (algoritmo.value === 'worst') return candidatos.reduce((mayor, actual) => actual.tamano > mayor.tamano ? actual : mayor);
  return candidatos[0];
}

// Divide un hueco cuando el proceso necesita menos espacio que el bloque disponible.
function colocarEnHueco(hueco, programa) {
  const indice = segmentos.indexOf(hueco);
  const proceso = { id: `proceso-${programa.pid}`, base: hueco.base, tamano: programa.tamano, pid: programa.pid, tipo: 'proceso' };
  const sobrante = hueco.tamano - programa.tamano;
  const nuevosSegmentos = [proceso];
  if (sobrante > 0) nuevosSegmentos.push({ id: `${hueco.id}-restante`, base: hueco.base + programa.tamano, tamano: sobrante, pid: null, tipo: 'hueco' });
  segmentos.splice(indice, 1, ...nuevosSegmentos);
}

// Asigna un programa respetando la modalidad de partición seleccionada.
function asignarMemoria(pid) {
  if (estados[pid] === 'En RAM') return;
  const programa = obtenerPrograma(pid);
  let destino = null;

  if (tipoParticion.value === 'fija') {
    destino = segmentos.find(segmento => segmento.pid === null && segmento.tamano >= programa.tamano);
    if (destino) destino.pid = pid;
  } else if (tipoParticion.value === 'variable') {
    destino = seleccionarHueco(programa.tamano);
    if (destino) destino.pid = pid;
  } else {
    destino = seleccionarHueco(programa.tamano);
    if (destino) colocarEnHueco(destino, programa);
  }

  if (!destino) {
    mostrarMensajeUsuario(`${pid} no cabe en un bloque libre disponible.`);
    return false;
  }

  estados[pid] = 'En RAM';
  colaFinalizacion.push(pid);
  numeroEvento += 1;
  mostrarMensajeUsuario(`${pid} fue asignado mediante ${nombreAlgoritmo()}.`);
  renderizarTodo();
  return true;
}

function nombreAlgoritmo() {
  if (tipoParticion.value === 'fija') return 'asignación secuencial';
  return { first: 'First-Fit', best: 'Best-Fit', worst: 'Worst-Fit' }[algoritmo.value];
}

// Libera el bloque de un proceso y une huecos vecinos en memoria dinámica.
function liberarProceso(pid) {
  const segmento = segmentos.find(item => item.pid === pid);
  if (!segmento) return;
  segmento.pid = null;
  segmento.tipo = tipoParticion.value === 'fija' || tipoParticion.value === 'variable' ? 'particion' : 'hueco';
  estados[pid] = 'Finalizado';
  colaFinalizacion = colaFinalizacion.filter(item => item !== pid);
  unirHuecosVecinos();
  numeroEvento += 1;
  mostrarMensajeUsuario(`${pid} liberó su espacio en RAM.`);
  renderizarTodo();
}

// La unión de huecos representa la disponibilidad continua en memoria dinámica.
function unirHuecosVecinos() {
  if (tipoParticion.value === 'fija' || tipoParticion.value === 'variable') return;
  for (let indice = segmentos.length - 1; indice > 0; indice -= 1) {
    const actual = segmentos[indice];
    const anterior = segmentos[indice - 1];
    if (actual.pid === null && anterior.pid === null) {
      anterior.tamano += actual.tamano;
      segmentos.splice(indice, 1);
    }
  }
}

// Compacta los procesos hacia el inicio de la memoria de usuario.
function compactarMemoria() {
  if (tipoParticion.value !== 'compactada') return;
  const procesos = segmentos.filter(segmento => segmento.pid !== null);
  let base = INICIO_USUARIO;
  segmentos = procesos.map(proceso => {
    const movido = { ...proceso, base };
    base += proceso.tamano;
    return movido;
  });
  if (base < FIN_RAM) segmentos.push({ id: 'hueco-final', base, tamano: FIN_RAM - base, pid: null, tipo: 'hueco' });
  numeroEvento += 1;
  mostrarMensajeUsuario('Memoria compactada: los procesos quedaron juntos al inicio.');
  renderizarTodo();
}

// Un evento asigna el siguiente programa en espera; luego finaliza los que ya corrieron.
function avanzarSimulacion() {
  const siguiente = programas.find(programa => estados[programa.pid] === 'Esperando');
  if (siguiente && asignarMemoria(siguiente.pid)) return;
  const pidParaLiberar = colaFinalizacion.find(item => estados[item] === 'En RAM');
  if (pidParaLiberar) {
    liberarProceso(pidParaLiberar);
    return;
  }
  detenerSimulacion(false);
  mostrarMensajeUsuario('Simulación finalizada: no hay más eventos pendientes.');
}

function iniciarSimulacion() {
  if (temporizador) return;
  mostrarMensajeUsuario('Simulación en marcha: cada evento intenta cargar o finalizar un proceso.');
  iniciar.disabled = true;
  detener.disabled = false;
  temporizador = setInterval(avanzarSimulacion, 1200);
}

function detenerSimulacion(mostrar = true) {
  clearInterval(temporizador);
  temporizador = null;
  iniciar.disabled = false;
  detener.disabled = true;
  if (mostrar) mostrarMensajeUsuario('Simulación detenida.');
}

// Construye la tabla solicitada por el taller, incluyendo fragmentación.
function renderizarTabla() {
  tablaParticiones.innerHTML = '';
  segmentos.forEach(segmento => {
    const programa = segmento.pid ? obtenerPrograma(segmento.pid) : null;
    const esParticion = tipoParticion.value === 'fija' || tipoParticion.value === 'variable';
    const fragmentacionInterna = programa && esParticion ? segmento.tamano - programa.tamano : 0;
    const fragmentacionExterna = !programa && !esParticion ? segmento.tamano : 0;
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td class="${programa ? 'ocupado' : 'libre'}">${programa ? `${programa.pid} / ${programa.nombre}` : 'Libre'}</td>
      <td>${programa ? 'O' : 'L'}</td>
      <td>${formatearHex(segmento.base)}</td>
      <td>${formatearTamano(segmento.tamano)}</td>
      <td>${formatearTamano(fragmentacionInterna)}</td>
      <td>${formatearTamano(fragmentacionExterna)}</td>
    `;
    tablaParticiones.appendChild(fila);
  });
}

// Dibuja cada segmento con una altura proporcional al tamaño real de la RAM.
function renderizarRAM() {
  ram.innerHTML = '';
  // Los segmentos se mantienen en orden de direcciones y CSS los muestra de abajo hacia arriba.
  const bloques = [{ base: 0, tamano: TAMANO_SO, pid: 'SO', tipo: 'so' }, ...segmentos];
  bloques.forEach(bloque => {
    const elemento = document.createElement('div');
    const programa = bloque.pid !== 'SO' && bloque.pid ? obtenerPrograma(bloque.pid) : null;
    elemento.className = `bloque-ram ${bloque.tipo === 'so' ? 'so' : bloque.pid ? '' : 'libre'}`;
    elemento.style.height = `${(bloque.tamano / RAM_TOTAL) * 100}%`;
    if (programa) elemento.style.background = programa.color;
    elemento.innerHTML = bloque.pid === 'SO'
      ? '<strong>Sistema Operativo</strong><span>0x000000 - 0x0FFFFF (base de la RAM)</span>'
      : bloque.pid
        ? `<strong>${bloque.pid} / ${programa.nombre}</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`
        : `<strong>Libre</strong><span>${formatearHex(bloque.base)} · ${formatearTamano(bloque.tamano)}</span>`;
    ram.appendChild(elemento);
  });
}

function renderizarResumen() {
  const usados = segmentos.filter(segmento => segmento.pid !== null).reduce((total, segmento) => total + segmento.tamano, 0);
  const porcentaje = ((usados / (RAM_TOTAL - TAMANO_SO)) * 100).toFixed(1);
  resumenOcupacion.textContent = `RAM de usuario: ${porcentaje}% ocupada`;
  resumenHuecos.textContent = `Huecos libres: ${obtenerHuecos().length}`;
  reloj.textContent = `Evento ${numeroEvento}`;
}

function renderizarTodo() {
  renderizarProgramas();
  renderizarTabla();
  renderizarRAM();
  renderizarResumen();
}

tipoParticion.addEventListener('change', () => {
  reiniciarSimulacion(false);
  mostrarMensajeUsuario('Tipo de partición cambiado. La memoria volvió a su estado inicial.');
});
algoritmo.addEventListener('change', () => mostrarMensajeUsuario(`Algoritmo seleccionado: ${nombreAlgoritmo()}.`));
iniciar.addEventListener('click', iniciarSimulacion);
detener.addEventListener('click', () => detenerSimulacion(true));
reiniciar.addEventListener('click', () => reiniciarSimulacion(true));
compactar.addEventListener('click', compactarMemoria);

// Estado inicial visible al abrir el archivo.
reiniciarSimulacion(false);
