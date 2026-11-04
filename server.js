// BúhoQuiz - servidor del juego en tiempo real.
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { leerExcel } = require('./lib/excel');
const { crearExcelResultados } = require('./lib/resultados');

const PORT = process.env.PORT || 3000;
const CLAVE_MAESTRO = process.env.ADMIN_PASSWORD || 'buho2026';
const MAX_JUGADORES = 200;
const TOP_RANKING = 10;

if (!process.env.ADMIN_PASSWORD) console.warn('[BúhoQuiz] Sin variable ADMIN_PASSWORD: se usa la clave por defecto "buho2026".');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const hash = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
const claveValida = (c) => crypto.timingSafeEqual(hash(c), hash(CLAVE_MAESTRO));
const ahora = () => Date.now();

function nuevoPin() {
  return String(crypto.randomInt(100000, 1000000));
}

function limpiarNombre(n) {
  return String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

// ---------------------------------------------------------------------------
// Estado: un juego activo a la vez + preguntas cargadas pendientes.
// ---------------------------------------------------------------------------
let cargado = null; // { preguntas, config, imagenes: Map, version }
let juego = null;
const almacenImagenes = new Map(); // version -> Map(nombre -> {buffer, mime})

function urlImagen(img, version) {
  if (!img) return null;
  if (img.tipo === 'url') return img.valor;
  return `/img/${version}/${encodeURIComponent(img.valor)}`;
}

function limpiarImagenesViejas() {
  const enUso = new Set([cargado && cargado.version, juego && juego.version].filter(Boolean));
  for (const v of almacenImagenes.keys()) if (!enUso.has(v)) almacenImagenes.delete(v);
}

function preguntaActual() {
  return juego && juego.idx >= 0 ? juego.preguntas[juego.idx] : null;
}

function jugadoresConectados() {
  return [...juego.jugadores.values()].filter((j) => j.conectado);
}

function calcularRanking() {
  return [...juego.jugadores.values()]
    .sort((a, b) => b.puntaje - a.puntaje || a.tiempoTotal - b.tiempoTotal || a.nombre.localeCompare(b.nombre))
    .map((j, i) => ({ pos: i + 1, token: j.token, nombre: j.nombre, puntaje: j.puntaje }));
}

// Puntaje: entre 50% y 100% según la rapidez. En MULTIPLE, cada correcta suma
// puntos/n y cada incorrecta marcada resta lo mismo (mínimo 0).
function puntuar(p, letras, ms) {
  const limite = p.tiempo * 1000;
  const factor = Math.max(0.5, 1 - 0.5 * Math.min(ms, limite) / limite);
  if (p.tipo === 'MULTIPLE') {
    const aciertos = letras.filter((l) => p.correctas.includes(l)).length;
    const errores = letras.length - aciertos;
    const fraccion = Math.max(0, (aciertos - errores) / p.correctas.length);
    const resultado = fraccion === 1 ? 'correcto' : fraccion > 0 ? 'parcial' : 'incorrecto';
    return { puntos: Math.round(p.puntos * fraccion * factor), resultado, aciertos, errores };
  }
  const ok = letras.length === 1 && p.correctas.includes(letras[0]);
  return { puntos: ok ? Math.round(p.puntos * factor) : 0, resultado: ok ? 'correcto' : 'incorrecto', aciertos: ok ? 1 : 0, errores: ok ? 0 : 1 };
}

// ---------------------------------------------------------------------------
// Vistas del estado para maestro y jugadores
// ---------------------------------------------------------------------------
function resumenCargado() {
  if (!cargado) return null;
  return {
    nombre: cargado.config.nombre_juego,
    total: cargado.preguntas.length,
    mostrarRanking: cargado.config.mostrar_ranking,
  };
}

function vistaPregunta(p, conRespuestas) {
  return {
    numero: p.numero,
    tipo: p.tipo,
    texto: p.texto,
    imagen: urlImagen(p.imagen, juego.version),
    opciones: p.opciones,
    tiempo: p.tiempo,
    puntos: p.puntos,
    correctas: conRespuestas ? p.correctas : undefined,
  };
}

function estadoMaestro() {
  if (!juego) return { fase: 'sin_juego', cargado: resumenCargado() };
  const p = preguntaActual();
  const conectados = jugadoresConectados();
  const e = {
    fase: juego.fase,
    pin: juego.pin,
    nombre: juego.config.nombre_juego,
    total: juego.preguntas.length,
    numero: p ? p.numero : 0,
    mostrarRanking: juego.config.mostrar_ranking,
    esUltima: juego.idx === juego.preguntas.length - 1,
    jugadores: [...juego.jugadores.values()].map((j) => ({ token: j.token, nombre: j.nombre, conectado: j.conectado, puntaje: j.puntaje })),
    conectados: conectados.length,
  };
  if (p && (juego.fase === 'pregunta' || juego.fase === 'revelacion')) {
    e.pregunta = vistaPregunta(p, juego.fase === 'revelacion');
    e.respondieron = [...juego.jugadores.values()].filter((j) => j.respuestas[p.numero] && j.respuestas[p.numero].letras.length).length;
    if (juego.fase === 'pregunta') e.restanteMs = Math.max(0, juego.finPregunta - ahora());
    if (juego.fase === 'revelacion') {
      const conteo = {};
      p.opciones.forEach((o) => { conteo[o.letra] = 0; });
      let correctos = 0;
      for (const j of juego.jugadores.values()) {
        const a = j.respuestas[p.numero];
        if (!a) continue;
        a.letras.forEach((l) => { conteo[l] = (conteo[l] || 0) + 1; });
        if (a.resultado === 'correcto') correctos++;
      }
      e.conteo = conteo;
      e.correctos = correctos;
    }
  }
  if (juego.fase === 'ranking' || juego.fase === 'podio') {
    const ranking = calcularRanking();
    e.ranking = ranking.slice(0, juego.fase === 'podio' ? 3 : TOP_RANKING).map((r) => {
      const j = juego.jugadores.get(r.token);
      const a = p && j.respuestas[p.numero];
      return { pos: r.pos, nombre: r.nombre, puntaje: r.puntaje, ganado: a ? a.puntos : 0 };
    });
  }
  return e;
}

function estadoJugador(j) {
  const p = preguntaActual();
  const e = {
    fase: juego.fase,
    nombre: j.nombre,
    puntaje: j.puntaje,
    total: juego.preguntas.length,
    numero: p ? p.numero : 0,
    jugadores: juego.jugadores.size,
  };
  if (juego.fase === 'pregunta' && p) {
    const a = j.respuestas[p.numero];
    e.pregunta = { tipo: p.tipo, opciones: p.opciones };
    e.restanteMs = Math.max(0, juego.finPregunta - ahora());
    e.tiempo = p.tiempo;
    e.respondida = Boolean(a);
    if (a) { e.misLetras = a.letras; e.puntaje = j.puntaje - a.puntos; } // no revelar puntos antes de tiempo
  }
  if ((juego.fase === 'revelacion' || juego.fase === 'ranking') && p) {
    const a = j.respuestas[p.numero];
    e.resultado = a
      ? { resultado: a.resultado, puntos: a.puntos, aciertos: a.aciertos, errores: a.errores, totalCorrectas: p.correctas.length, tipo: p.tipo }
      : { resultado: 'sin_respuesta', puntos: 0, totalCorrectas: p.correctas.length, tipo: p.tipo };
  }
  if (juego.fase !== 'lobby' && juego.fase !== 'pregunta') {
    const ranking = calcularRanking();
    const r = ranking.find((x) => x.token === j.token);
    e.posicion = r ? r.pos : null;
  }
  return e;
}

function emitirMaestros() {
  io.to('maestros').emit('estado', estadoMaestro());
}

function emitirJugador(j) {
  if (j.socketId) io.to(j.socketId).emit('estado', estadoJugador(j));
}

function emitirTodo() {
  emitirMaestros();
  if (juego) for (const j of juego.jugadores.values()) emitirJugador(j);
}

// ---------------------------------------------------------------------------
// Flujo del juego
// ---------------------------------------------------------------------------
function iniciarPregunta(idx) {
  clearTimeout(juego.temporizador);
  juego.idx = idx;
  juego.fase = 'pregunta';
  const p = preguntaActual();
  juego.inicioPregunta = ahora();
  juego.finPregunta = juego.inicioPregunta + p.tiempo * 1000;
  juego.temporizador = setTimeout(cerrarPregunta, p.tiempo * 1000 + 400);
  emitirTodo();
}

function cerrarPregunta() {
  if (!juego || juego.fase !== 'pregunta') return;
  clearTimeout(juego.temporizador);
  const p = preguntaActual();
  for (const j of juego.jugadores.values()) {
    if (!j.respuestas[p.numero]) {
      j.respuestas[p.numero] = { letras: [], ms: p.tiempo * 1000, puntos: 0, resultado: 'sin_respuesta', aciertos: 0, errores: 0 };
      j.tiempoTotal += p.tiempo * 1000;
    }
  }
  juego.preguntasJugadas = Math.max(juego.preguntasJugadas, juego.idx + 1);
  juego.fase = 'revelacion';
  emitirTodo();
}

function verificarTodosRespondieron() {
  if (!juego || juego.fase !== 'pregunta') return;
  const p = preguntaActual();
  const conectados = jugadoresConectados();
  if (conectados.length && conectados.every((j) => j.respuestas[p.numero])) cerrarPregunta();
}

function avanzar() {
  if (!juego) return;
  const ultima = juego.idx >= juego.preguntas.length - 1;
  if (juego.fase === 'lobby') iniciarPregunta(0);
  else if (juego.fase === 'pregunta') cerrarPregunta();
  else if (juego.fase === 'revelacion') {
    if (juego.config.mostrar_ranking || ultima) { juego.fase = ultima ? 'podio' : 'ranking'; emitirTodo(); }
    else iniciarPregunta(juego.idx + 1);
  } else if (juego.fase === 'ranking') {
    if (ultima) { juego.fase = 'podio'; emitirTodo(); }
    else iniciarPregunta(juego.idx + 1);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/maestro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'maestro.html')));
app.get('/salud', (req, res) => res.json({ ok: true }));

function soloMaestro(req, res, next) {
  if (!claveValida(req.get('x-clave'))) return res.status(401).json({ ok: false, errores: ['Clave de maestro incorrecta.'] });
  next();
}

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 101 },
});

app.post('/api/cargar', soloMaestro, (req, res) => {
  subida.array('archivos')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Un archivo supera los 8 MB. Reduce el tamaño de las imágenes.' : err.code === 'LIMIT_FILE_COUNT' ? 'Demasiados archivos (máximo 100 imágenes).' : 'Error al subir los archivos.';
      return res.status(400).json({ ok: false, errores: [msg] });
    }
    if (juego && juego.fase !== 'podio') return res.status(409).json({ ok: false, errores: ['Hay un juego en curso. Termínalo (Nuevo juego) antes de cargar otro Excel.'] });

    const archivos = req.files || [];
    const excels = archivos.filter((f) => /\.xlsx$/i.test(f.originalname));
    const imagenes = archivos.filter((f) => /^image\//.test(f.mimetype) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.originalname));
    const otros = archivos.filter((f) => !excels.includes(f) && !imagenes.includes(f));
    if (excels.length !== 1) return res.json({ ok: false, errores: [excels.length ? 'Selecciona un solo archivo Excel.' : 'No se seleccionó ningún archivo Excel (.xlsx).'], avisos: [] });

    const mapaImg = new Map();
    for (const f of imagenes) {
      const nombre = path.basename(f.originalname).toLowerCase();
      const ext = nombre.split('.').pop();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || f.mimetype;
      mapaImg.set(nombre, { buffer: f.buffer, mime });
    }

    const r = await leerExcel(excels[0].buffer, new Set(mapaImg.keys()));
    if (otros.length) r.avisos.unshift(`Se ignoraron ${otros.length} archivo(s) que no son Excel ni imagen: ${otros.map((f) => f.originalname).join(', ')}`);
    if (!r.ok) return res.json({ ok: false, errores: r.errores, avisos: r.avisos });

    const version = crypto.randomBytes(6).toString('hex');
    almacenImagenes.set(version, mapaImg);
    cargado = { preguntas: r.preguntas, config: r.config, version };
    if (juego && juego.fase === 'podio') { clearTimeout(juego.temporizador); juego = null; }
    limpiarImagenesViejas();
    emitirMaestros();
    res.json({
      ok: true,
      avisos: r.avisos,
      config: r.config,
      preguntas: r.preguntas.map((p) => ({ ...p, imagen: urlImagen(p.imagen, version) })),
    });
  });
});

app.get('/img/:version/:nombre', (req, res) => {
  const mapa = almacenImagenes.get(req.params.version);
  const img = mapa && mapa.get(String(req.params.nombre).toLowerCase());
  if (!img) return res.status(404).end();
  res.set('Content-Type', img.mime);
  if (img.mime === 'image/svg+xml') res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(img.buffer);
});

app.get('/api/qr', async (req, res) => {
  const texto = String(req.query.texto || '').slice(0, 300);
  if (!texto) return res.status(400).end();
  try {
    const svg = await QRCode.toString(texto, { type: 'svg', margin: 1, color: { dark: '#071233', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch {
    res.status(500).end();
  }
});

app.get('/api/resultados', soloMaestro, async (req, res) => {
  if (!juego || !juego.preguntasJugadas) return res.status(404).json({ ok: false, errores: ['Aún no hay resultados.'] });
  const buffer = await crearExcelResultados(juego, calcularRanking());
  const fecha = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="resultados_buhoquiz_${fecha}.xlsx"`);
  res.send(Buffer.from(buffer));
});

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
io.use((socket, next) => {
  const { rol, clave } = socket.handshake.auth || {};
  if (rol === 'maestro') {
    if (!claveValida(clave)) return next(new Error('clave'));
    socket.data.rol = 'maestro';
  } else socket.data.rol = 'jugador';
  next();
});

io.on('connection', (socket) => {
  if (socket.data.rol === 'maestro') {
    socket.join('maestros');
    socket.emit('estado', estadoMaestro());

    socket.on('maestro:abrir', (_, ack = () => {}) => {
      if (!cargado) return ack({ ok: false, error: 'Primero carga un Excel.' });
      if (juego && juego.fase !== 'podio') return ack({ ok: false, error: 'Ya hay un juego en curso.' });
      if (juego) clearTimeout(juego.temporizador);
      juego = {
        pin: nuevoPin(),
        version: cargado.version,
        config: cargado.config,
        preguntas: cargado.preguntas,
        jugadores: new Map(),
        fase: 'lobby',
        idx: -1,
        preguntasJugadas: 0,
        temporizador: null,
      };
      limpiarImagenesViejas();
      emitirMaestros();
      ack({ ok: true });
    });

    socket.on('maestro:avanzar', (_, ack = () => {}) => {
      if (!juego) return ack({ ok: false });
      if (juego.fase === 'lobby' && !juego.jugadores.size) return ack({ ok: false, error: 'Aún no hay jugadores.' });
      avanzar();
      ack({ ok: true });
    });

    socket.on('maestro:expulsar', ({ token } = {}) => {
      if (!juego || !juego.jugadores.has(token)) return;
      const j = juego.jugadores.get(token);
      juego.jugadores.delete(token);
      if (j.socketId) io.to(j.socketId).emit('expulsado');
      emitirMaestros();
      verificarTodosRespondieron();
    });

    socket.on('maestro:nuevo', () => {
      if (juego) {
        clearTimeout(juego.temporizador);
        for (const j of juego.jugadores.values()) if (j.socketId) io.to(j.socketId).emit('fin_sesion');
      }
      juego = null;
      limpiarImagenesViejas();
      emitirMaestros();
    });
    return;
  }

  // ---- Jugador ----
  socket.on('jugador:unirse', ({ pin, nombre, token } = {}, ack = () => {}) => {
    if (!juego || String(pin).trim() !== juego.pin) return ack({ ok: false, error: 'PIN incorrecto o el juego aún no está abierto.' });
    if (juego.fase === 'podio') return ack({ ok: false, error: 'Este juego ya terminó.' });

    let j = token && juego.jugadores.get(token);
    if (j) {
      // Reconexión
      if (j.socketId && j.socketId !== socket.id) io.to(j.socketId).emit('fin_sesion');
    } else {
      const limpio = limpiarNombre(nombre);
      if (!limpio) return ack({ ok: false, error: 'Escribe tu nombre o apodo.' });
      const ocupado = [...juego.jugadores.values()].some((x) => x.nombre.toLowerCase() === limpio.toLowerCase());
      if (ocupado) return ack({ ok: false, error: 'Ese nombre ya está en uso. Prueba con otro.' });
      if (juego.jugadores.size >= MAX_JUGADORES) return ack({ ok: false, error: 'El juego está lleno.' });
      j = { token: crypto.randomUUID(), nombre: limpio, puntaje: 0, tiempoTotal: 0, respuestas: {}, conectado: true, socketId: null };
      juego.jugadores.set(j.token, j);
    }
    j.socketId = socket.id;
    j.conectado = true;
    socket.data.token = j.token;
    socket.data.pin = juego.pin;
    ack({ ok: true, token: j.token, nombre: j.nombre, pin: juego.pin });
    emitirJugador(j);
    emitirMaestros();
  });

  socket.on('jugador:responder', ({ letras } = {}, ack = () => {}) => {
    if (!juego || socket.data.pin !== juego.pin) return ack({ ok: false, error: 'Sin juego.' });
    const j = juego.jugadores.get(socket.data.token);
    const p = preguntaActual();
    if (!j || !p || juego.fase !== 'pregunta') return ack({ ok: false, error: 'La pregunta ya se cerró.' });
    if (j.respuestas[p.numero]) return ack({ ok: false, error: 'Ya respondiste.' });
    const validas = new Set(p.opciones.map((o) => o.letra));
    const elegidas = [...new Set(Array.isArray(letras) ? letras.map(String) : [])].filter((l) => validas.has(l)).sort();
    if (!elegidas.length) return ack({ ok: false, error: 'Elige una opción.' });
    if (p.tipo !== 'MULTIPLE' && elegidas.length !== 1) return ack({ ok: false, error: 'Elige solo una opción.' });
    const ms = ahora() - juego.inicioPregunta;
    if (ms > p.tiempo * 1000 + 500) return ack({ ok: false, error: 'Se acabó el tiempo.' });

    const r = puntuar(p, elegidas, ms);
    j.respuestas[p.numero] = { letras: elegidas, ms, ...r };
    j.puntaje += r.puntos;
    j.tiempoTotal += ms;
    ack({ ok: true });
    emitirJugador(j);
    emitirMaestros();
    verificarTodosRespondieron();
  });

  socket.on('disconnect', () => {
    if (!juego || socket.data.pin !== juego.pin) return;
    const j = juego.jugadores.get(socket.data.token);
    if (j && j.socketId === socket.id) {
      j.conectado = false;
      j.socketId = null;
      emitirMaestros();
      verificarTodosRespondieron();
    }
  });
});

server.listen(PORT, () => {
  console.log(`BúhoQuiz listo en http://localhost:${PORT}`);
  console.log(`  Maestro:   http://localhost:${PORT}/maestro`);
  console.log(`  Jugadores: http://localhost:${PORT}/`);
});
