// Prueba de carga: sube un Excel, abre la sala, conecta N jugadores que responden al azar
// y recorre todo el juego hasta el podio. Uso:
//   node scripts/simular.js [excel] [jugadores] [url]
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const EXCEL = process.argv[2] || path.join(__dirname, '..', 'public', 'plantilla_buhoquiz.xlsx');
const N = Number(process.argv[3] || 50);
const URL = process.argv[4] || 'http://localhost:3000';
const CLAVE = process.env.ADMIN_PASSWORD || 'buho2026';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1) Subir Excel
  const fd = new FormData();
  fd.append('archivos', new Blob([fs.readFileSync(EXCEL)]), path.basename(EXCEL));
  const r = await (await fetch(`${URL}/api/cargar`, { method: 'POST', headers: { 'x-clave': CLAVE }, body: fd })).json();
  console.log('Validación:', r.ok ? `OK (${r.preguntas.length} preguntas)` : 'CON ERRORES');
  (r.errores || []).forEach((e) => console.log('  ERROR:', e));
  (r.avisos || []).forEach((e) => console.log('  AVISO:', e));
  if (!r.ok) return;
  const preguntas = r.preguntas;

  // 2) Maestro
  const maestro = io(URL, { auth: { rol: 'maestro', clave: CLAVE }, transports: ['websocket'] });
  let estadoM = null;
  maestro.on('estado', (e) => { estadoM = e; });
  await new Promise((res) => maestro.on('connect', res));
  maestro.emit('maestro:nuevo');
  await espera(200);
  await new Promise((res) => maestro.emit('maestro:abrir', null, res));
  await espera(200);
  const pin = estadoM.pin;
  console.log('Sala abierta, PIN', pin);

  // 3) Jugadores
  const jugadores = [];
  for (let i = 0; i < N; i++) {
    const s = io(URL, { auth: { rol: 'jugador' }, transports: ['websocket'], forceNew: true });
    const j = { s, nombre: `Jugador${i + 1}`, estado: null, respondidas: new Set() };
    s.on('estado', (e) => {
      j.estado = e;
      if (e.fase === 'pregunta' && !e.respondida && !j.respondidas.has(e.numero)) {
        j.respondidas.add(e.numero);
        const p = e.pregunta;
        // 1 de cada 5 no responde (para probar el cierre por tiempo es mejor que todos respondan; se deja a todos)
        const demora = 200 + Math.random() * 2500;
        setTimeout(() => {
          let letras;
          const q = preguntas.find((x) => x.numero === e.numero);
          if (i % 3 === 0) letras = q.correctas; // un tercio siempre acierta
          else if (p.tipo === 'MULTIPLE') letras = p.opciones.filter(() => Math.random() < 0.5).map((o) => o.letra);
          else letras = [p.opciones[Math.floor(Math.random() * p.opciones.length)].letra];
          if (!letras.length) letras = [p.opciones[0].letra];
          s.emit('jugador:responder', { letras }, (ack) => { if (!ack.ok) console.log(j.nombre, 'rechazo:', ack.error); });
        }, demora);
      }
    });
    await new Promise((res) => s.on('connect', res));
    const ack = await new Promise((res) => s.emit('jugador:unirse', { pin, nombre: j.nombre }, res));
    if (!ack.ok) throw new Error('No pudo unirse ' + j.nombre + ': ' + ack.error);
    jugadores.push(j);
  }
  await espera(300);
  console.log('Jugadores en sala:', estadoM.jugadores.length);

  // Nombre repetido debe rechazarse
  const dup = io(URL, { auth: { rol: 'jugador' }, transports: ['websocket'], forceNew: true });
  await new Promise((res) => dup.on('connect', res));
  const ackDup = await new Promise((res) => dup.emit('jugador:unirse', { pin, nombre: 'jugador1' }, res));
  console.log('Nombre repetido rechazado:', !ackDup.ok, '-', ackDup.error);
  dup.close();

  // 4) Recorrer el juego
  const avanzar = () => new Promise((res) => maestro.emit('maestro:avanzar', null, res));
  await avanzar(); // lobby -> pregunta 1
  for (let n = 1; n <= preguntas.length; n++) {
    const t0 = Date.now();
    while (estadoM.fase === 'pregunta') await espera(100);
    const e = estadoM;
    console.log(`P${n} [${e.pregunta.tipo}] cerrada en ${((Date.now() - t0) / 1000).toFixed(1)}s · respondieron ${e.respondieron}/${e.conectados} · correctos ${e.correctos} · conteo ${JSON.stringify(e.conteo)}`);
    await espera(200);
    const muestra = jugadores[0].estado.resultado;
    console.log(`   Jugador1 (siempre acierta): ${muestra.resultado} +${muestra.puntos}`);
    const j1 = jugadores[1].estado.resultado;
    console.log(`   Jugador2 (azar): ${j1.resultado} +${j1.puntos}${j1.tipo === 'MULTIPLE' ? ` (aciertos ${j1.aciertos}, errores ${j1.errores})` : ''}`);
    await avanzar(); // -> ranking o siguiente
    await espera(200);
    if (estadoM.fase === 'ranking') {
      console.log('   Top 3:', estadoM.ranking.slice(0, 3).map((r) => `${r.pos}.${r.nombre}(${r.puntaje})`).join(' '));
      await avanzar();
      await espera(200);
    }
  }
  console.log('Fase final:', estadoM.fase);
  console.log('Podio:', estadoM.ranking.map((r) => `${r.pos}.${r.nombre} ${r.puntaje}`).join(' | '));
  const finales = jugadores.slice(0, 4).map((j) => `${j.nombre}: puesto ${j.estado.posicion}, ${j.estado.puntaje} pts`);
  console.log('Vista celular:', finales.join(' · '));

  // 5) Descargar resultados
  const res = await fetch(`${URL}/api/resultados`, { headers: { 'x-clave': CLAVE } });
  const buf = Buffer.from(await res.arrayBuffer());
  const salida = path.join(process.env.SALIDA || __dirname, 'resultados_prueba.xlsx');
  fs.writeFileSync(salida, buf);
  console.log('Resultados descargados:', res.status, buf.length, 'bytes →', salida);

  jugadores.forEach((j) => j.s.close());
  maestro.close();
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
