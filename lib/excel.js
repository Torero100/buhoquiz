// Lectura y validación del Excel de preguntas de BúhoQuiz.
const ExcelJS = require('exceljs');

const LETRAS = ['A', 'B', 'C', 'D'];
const TIPOS = ['UNICA', 'VF', 'MULTIPLE'];

const quitarTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => quitarTildes(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Nombres de columna aceptados (se comparan sin tildes, sin mayúsculas y con "_" en lugar de espacios).
const ALIAS_COLUMNAS = {
  orden: ['orden', 'orden_de_pregunta', 'n', 'nro', 'numero', 'num', 'id'],
  tipo: ['tipo', 'tipo_pregunta', 'tipo_de_pregunta'],
  pregunta: ['pregunta', 'enunciado'],
  imagen: ['imagen', 'image', 'foto', 'img', 'imagen_url'],
  A: ['opcion_a', 'a', 'alternativa_a'],
  B: ['opcion_b', 'b', 'alternativa_b'],
  C: ['opcion_c', 'c', 'alternativa_c'],
  D: ['opcion_d', 'd', 'alternativa_d'],
  respuesta: ['respuesta', 'respuestas', 'correcta', 'correctas', 'respuesta_correcta'],
  tiempo: ['tiempo_seg', 'tiempo', 'segundos', 'tiempo_segundos'],
  puntos: ['puntos', 'puntaje'],
};

const ALIAS_TIPOS = {
  UNICA: ['unica', 'u', 'simple', 'una'],
  VF: ['vf', 'v_f', 'verdadero_falso', 'verdadero_o_falso'],
  MULTIPLE: ['multiple', 'm', 'varias', 'multirespuesta', 'multi', 'varias_respuestas'],
};

function textoCelda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Verdadero' : 'Falso';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if ('result' in v) return textoCelda(v.result);
    if ('text' in v) return textoCelda(v.text);
    if ('hyperlink' in v) return String(v.hyperlink).trim();
    if ('error' in v) return '';
    return '';
  }
  return String(v).trim();
}

// Para la columna imagen: si la celda es un hipervínculo, se usa el destino del enlace.
function urlCelda(v) {
  if (v && typeof v === 'object' && v.hyperlink && /^https?:\/\//i.test(v.hyperlink)) return String(v.hyperlink).trim();
  return textoCelda(v);
}

function hojaPorNombre(wb, nombre) {
  return wb.worksheets.find((ws) => clave(ws.name) === nombre);
}

function leerConfig(wb) {
  const config = { nombre_juego: 'BúhoQuiz', tiempo_defecto: 20, puntos_defecto: 1000, mostrar_ranking: true };
  const avisos = [];
  const ws = hojaPorNombre(wb, 'config');
  if (!ws) return { config, avisos };
  ws.eachRow((row) => {
    const k = clave(textoCelda(row.getCell(1).value));
    const val = textoCelda(row.getCell(2).value);
    if (!k || !val) return;
    if (k === 'nombre_juego') config.nombre_juego = val.slice(0, 60);
    else if (k === 'tiempo_defecto') {
      const n = Number(val);
      if (Number.isInteger(n) && n >= 5 && n <= 120) config.tiempo_defecto = n;
      else avisos.push(`Hoja config: tiempo_defecto "${val}" no es válido (5 a 120). Se usará 20.`);
    } else if (k === 'puntos_defecto') {
      const n = Number(val);
      if (Number.isInteger(n) && n >= 100 && n <= 10000) config.puntos_defecto = n;
      else avisos.push(`Hoja config: puntos_defecto "${val}" no es válido (100 a 10000). Se usará 1000.`);
    } else if (k === 'mostrar_ranking') {
      config.mostrar_ranking = !['no', 'n', 'falso', 'false', '0'].includes(clave(val));
    }
  });
  return { config, avisos };
}

function interpretarTipo(texto) {
  const k = clave(texto);
  for (const [tipo, alias] of Object.entries(ALIAS_TIPOS)) if (alias.includes(k)) return tipo;
  return null;
}

// Convierte "B", "opcion_B", "A;C;D", "a, c" (o Verdadero/Falso en VF) en letras.
function interpretarRespuesta(texto, tipo) {
  const limpio = quitarTildes(texto).toUpperCase().replace(/OPCION[\s_]*/g, ' ');
  const partes = limpio.split(/[^A-Z]+/).filter(Boolean);
  const letras = [];
  const invalidas = [];
  for (const p of partes) {
    let l = p;
    if (tipo === 'VF' || !LETRAS.includes(p)) {
      if (['VERDADERO', 'TRUE', 'V', 'SI'].includes(p) && tipo === 'VF') l = 'A';
      else if (['FALSO', 'FALSE', 'F', 'NO'].includes(p) && tipo === 'VF') l = 'B';
    }
    if (LETRAS.includes(l)) { if (!letras.includes(l)) letras.push(l); }
    else invalidas.push(p);
  }
  return { letras: letras.sort(), invalidas };
}

/**
 * Lee el Excel y devuelve { ok, errores, avisos, preguntas, config }.
 * nombresImagenes: Set con los nombres (en minúsculas) de las imágenes subidas junto al Excel.
 */
async function leerExcel(buffer, nombresImagenes = new Set()) {
  const errores = [];
  const avisos = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, errores: ['No se pudo abrir el archivo. Verifica que sea un Excel .xlsx válido (y que no esté protegido con contraseña).'], avisos, preguntas: [], config: null };
  }

  const { config, avisos: avisosConfig } = leerConfig(wb);
  avisos.push(...avisosConfig);

  const ws = hojaPorNombre(wb, 'preguntas') || wb.worksheets.find((w) => clave(w.name) !== 'config' && clave(w.name) !== 'instrucciones');
  if (!ws) return { ok: false, errores: ['El Excel no tiene una hoja llamada "preguntas".'], avisos, preguntas: [], config };
  if (clave(ws.name) !== 'preguntas') avisos.push(`No se encontró la hoja "preguntas"; se usó la hoja "${ws.name}".`);

  // Buscar la fila de encabezados (la primera que tenga una columna "pregunta").
  let filaEnc = 0;
  const columnas = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !filaEnc; r++) {
    const row = ws.getRow(r);
    const encontrados = {};
    row.eachCell((cell, col) => {
      const k = clave(textoCelda(cell.value));
      for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
        if (alias.includes(k) && !(campo in encontrados)) encontrados[campo] = col;
      }
    });
    if ('pregunta' in encontrados) { filaEnc = r; Object.assign(columnas, encontrados); }
  }
  if (!filaEnc) return { ok: false, errores: ['No se encontró la fila de encabezados. Debe existir al menos la columna "pregunta" (usa la plantilla).'], avisos, preguntas: [], config };

  for (const obligatoria of ['pregunta', 'A', 'B', 'respuesta']) {
    if (!(obligatoria in columnas)) {
      const nombre = { A: 'opcion_A', B: 'opcion_B' }[obligatoria] || obligatoria;
      errores.push(`Falta la columna obligatoria "${nombre}".`);
    }
  }
  if (errores.length) return { ok: false, errores, avisos, preguntas: [], config };
  if (!('tipo' in columnas)) avisos.push('No hay columna "tipo": se deducirá el tipo de cada pregunta (se recomienda agregarla).');

  const preguntas = [];
  const imagenesUsadas = new Set();
  const ordenesVistos = new Map();

  for (let r = filaEnc + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const val = (campo) => (campo in columnas ? textoCelda(row.getCell(columnas[campo]).value) : '');
    const campos = ['orden', 'tipo', 'pregunta', 'imagen', 'A', 'B', 'C', 'D', 'respuesta', 'tiempo', 'puntos'];
    if (campos.every((c) => !val(c))) continue; // fila vacía

    const f = `Fila ${r}`;
    const errFila = [];
    const texto = val('pregunta');
    if (!texto) errFila.push(`${f}: falta el texto de la pregunta.`);
    else if (texto.length > 200) avisos.push(`${f}: la pregunta es muy larga (${texto.length} caracteres); puede verse pequeña en pantalla.`);

    // Opciones
    const opciones = {};
    for (const l of LETRAS) { const t = val(l); if (t) opciones[l] = t.slice(0, 120); }

    // Tipo
    let tipo = null;
    const tipoTexto = val('tipo');
    if (tipoTexto) {
      tipo = interpretarTipo(tipoTexto);
      if (!tipo) errFila.push(`${f}: tipo "${tipoTexto}" no válido. Usa UNICA, VF o MULTIPLE.`);
    } else {
      const pre = interpretarRespuesta(val('respuesta'), null);
      const esVF = Object.keys(opciones).length === 2 && ['verdadero', 'falso'].includes(clave(opciones.A)) && ['verdadero', 'falso'].includes(clave(opciones.B));
      tipo = esVF ? 'VF' : pre.letras.length > 1 ? 'MULTIPLE' : 'UNICA';
      if ('tipo' in columnas) avisos.push(`${f}: sin tipo; se asumió ${tipo}.`);
    }

    if (tipo === 'VF') {
      if (!opciones.A) opciones.A = 'Verdadero';
      if (!opciones.B) opciones.B = 'Falso';
      if (opciones.C || opciones.D) errFila.push(`${f}: una pregunta VF solo debe tener opcion_A (Verdadero) y opcion_B (Falso); deja vacías C y D.`);
    }

    const letrasDisponibles = LETRAS.filter((l) => opciones[l]);
    if (letrasDisponibles.length < 2) errFila.push(`${f}: necesita al menos 2 opciones (opcion_A y opcion_B).`);
    // Detectar huecos: por ejemplo opcion_D con texto pero opcion_C vacía.
    const ultima = Math.max(...letrasDisponibles.map((l) => LETRAS.indexOf(l)), -1);
    for (let i = 0; i <= ultima; i++) if (!opciones[LETRAS[i]]) errFila.push(`${f}: opcion_${LETRAS[i]} está vacía pero hay opciones después de ella.`);

    // Respuesta
    const respTexto = val('respuesta');
    let correctas = [];
    if (!respTexto) errFila.push(`${f}: falta la respuesta correcta.`);
    else {
      const { letras, invalidas } = interpretarRespuesta(respTexto, tipo);
      if (invalidas.length) errFila.push(`${f}: respuesta "${respTexto}" no se entiende. Escribe letras como B o A;C;D.`);
      correctas = letras;
      for (const l of letras) if (!opciones[l]) errFila.push(`${f}: la respuesta ${l} no tiene texto en opcion_${l}.`);
      if (tipo && tipo !== 'MULTIPLE' && letras.length > 1) errFila.push(`${f}: tipo ${tipo} debe tener una sola respuesta correcta (usa MULTIPLE si hay varias).`);
      if (tipo === 'MULTIPLE' && letras.length < 2) errFila.push(`${f}: tipo MULTIPLE necesita 2 o más respuestas correctas (usa UNICA si solo hay una).`);
      if (tipo === 'MULTIPLE' && letras.length === letrasDisponibles.length && letras.length) avisos.push(`${f}: todas las opciones son correctas.`);
    }

    // Tiempo y puntos
    let tiempo = config.tiempo_defecto;
    const tTexto = val('tiempo');
    if (tTexto) {
      const n = Number(tTexto);
      if (!Number.isInteger(n) || n < 5 || n > 120) errFila.push(`${f}: tiempo_seg "${tTexto}" debe ser un número entero entre 5 y 120.`);
      else tiempo = n;
    }
    let puntos = config.puntos_defecto;
    const pTexto = val('puntos');
    if (pTexto) {
      const n = Number(pTexto);
      if (!Number.isInteger(n) || n < 100 || n > 10000) errFila.push(`${f}: puntos "${pTexto}" debe ser un número entero entre 100 y 10000.`);
      else puntos = n;
    }

    // Imagen
    let imagen = null;
    const imgTexto = 'imagen' in columnas ? urlCelda(row.getCell(columnas.imagen).value) : '';
    if (imgTexto) {
      if (/^https?:\/\//i.test(imgTexto)) {
        imagen = { tipo: 'url', valor: imgTexto };
        if (/^http:\/\//i.test(imgTexto)) avisos.push(`${f}: la imagen usa http:// (no seguro); si no se ve, usa una URL https:// o sube el archivo.`);
      } else {
        const nombre = imgTexto.split(/[\\/]/).pop().toLowerCase();
        if (!nombresImagenes.has(nombre)) errFila.push(`${f}: no se subió la imagen "${imgTexto}". Selecciónala junto con el Excel o usa una URL.`);
        else { imagen = { tipo: 'archivo', valor: nombre }; imagenesUsadas.add(nombre); }
      }
    }

    // Orden
    let orden = preguntas.length + 1;
    const oTexto = val('orden');
    if (oTexto) {
      const n = Number(oTexto);
      if (!Number.isFinite(n)) avisos.push(`${f}: orden "${oTexto}" no es un número; se respetará la posición de la fila.`);
      else {
        orden = n;
        if (ordenesVistos.has(n)) avisos.push(`${f}: el orden ${n} está repetido (también en la fila ${ordenesVistos.get(n)}).`);
        ordenesVistos.set(n, r);
      }
    }

    errores.push(...errFila);
    preguntas.push({
      fila: r,
      orden,
      tipo: tipo || 'UNICA',
      texto,
      imagen,
      opciones: letrasDisponibles.map((l) => ({ letra: l, texto: opciones[l] })),
      correctas,
      tiempo,
      puntos,
    });
  }

  if (!preguntas.length) errores.push('La hoja "preguntas" no tiene preguntas debajo de los encabezados.');
  for (const n of nombresImagenes) if (!imagenesUsadas.has(n)) avisos.push(`La imagen "${n}" se subió pero ninguna pregunta la usa.`);

  preguntas.sort((a, b) => a.orden - b.orden || a.fila - b.fila);
  preguntas.forEach((p, i) => { p.numero = i + 1; });

  return { ok: errores.length === 0, errores, avisos, preguntas, config };
}

module.exports = { leerExcel, LETRAS, TIPOS };
