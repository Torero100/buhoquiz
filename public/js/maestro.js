// Pantalla del maestro (proyector).
(function () {
  const { colorOpcion, NOMBRE_TIPO, buhoSVG, confeti, el, fmt } = window.Buho;
  const $ = (id) => document.getElementById(id);
  const VISTAS = ['v-carga', 'v-lobby', 'v-pregunta', 'v-ranking', 'v-podio'];

  $('logo-login').innerHTML = buhoSVG('azul');
  $('logo-panel').innerHTML = buhoSVG('azul');
  $('logo-login').style.width = '60px';
  $('logo-panel').style.width = '50px';

  let clave = null;
  try { clave = sessionStorage.getItem('buhoquiz_clave'); } catch (e) { /* nada */ }
  let socket = null;
  let estado = null;
  let claveVista = '';
  let reloj = null;
  let archivos = [];
  let ultimaValidacion = null;

  // ------------------------------------------------------------------ Login
  function conectar() {
    if (socket) socket.disconnect();
    socket = io({ auth: { rol: 'maestro', clave }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      try { sessionStorage.setItem('buhoquiz_clave', clave); } catch (e) { /* nada */ }
      $('login').classList.add('oculto');
      $('panel').classList.remove('oculto');
      $('pie-error').textContent = '';
    });
    socket.on('connect_error', (err) => {
      if (err && err.message === 'clave') {
        socket.disconnect();
        try { sessionStorage.removeItem('buhoquiz_clave'); } catch (e) { /* nada */ }
        $('login').classList.remove('oculto');
        $('panel').classList.add('oculto');
        $('error-login').textContent = 'Clave incorrecta.';
      } else {
        $('pie-error').textContent = 'Reconectando con el servidor…';
      }
    });
    socket.on('disconnect', () => { $('pie-error').textContent = 'Conexión perdida, reintentando…'; });
    socket.on('estado', (e) => { $('pie-error').textContent = ''; render(e); });
  }

  $('form-login').addEventListener('submit', (ev) => {
    ev.preventDefault();
    clave = $('clave').value;
    $('error-login').textContent = '';
    conectar();
  });
  if (clave) conectar();

  // ------------------------------------------------------------ Botones fijos
  $('btn-completa').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
  $('btn-nuevo').addEventListener('click', () => {
    const enCurso = estado && estado.fase !== 'podio';
    if (enCurso && !confirm('¿Terminar el juego actual? Los participantes saldrán de la sala.')) return;
    socket.emit('maestro:nuevo');
  });
  $('btn-avanzar').addEventListener('click', () => {
    $('btn-avanzar').disabled = true;
    socket.emit('maestro:avanzar', null, (r) => {
      $('btn-avanzar').disabled = false;
      if (r && !r.ok && r.error) $('pie-error').textContent = r.error;
    });
  });
  $('btn-resultados').addEventListener('click', async () => {
    try {
      const resp = await fetch('/api/resultados', { headers: { 'x-clave': clave } });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const nombre = (resp.headers.get('Content-Disposition') || '').match(/filename="(.+)"/);
      const a = el('a', { href: URL.createObjectURL(blob), download: nombre ? nombre[1] : 'resultados_buhoquiz.xlsx' });
      document.body.append(a); a.click(); a.remove();
    } catch (e) {
      $('pie-error').textContent = 'No se pudieron descargar los resultados.';
    }
  });

  // ------------------------------------------------------------ Carga Excel
  const zona = $('zona');
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('encima'); }));
  zona.addEventListener('drop', (e) => elegirArchivos(e.dataTransfer.files));
  $('archivos').addEventListener('change', (e) => elegirArchivos(e.target.files));

  function elegirArchivos(lista) {
    archivos = [...lista].filter((f) => /\.xlsx$/i.test(f.name) || /^image\//.test(f.type));
    $('lista-archivos').replaceChildren(...archivos.map((f) => el('li', {}, (/\.xlsx$/i.test(f.name) ? '📊 ' : '🖼️ ') + f.name)));
    $('btn-validar').disabled = !archivos.some((f) => /\.xlsx$/i.test(f.name));
    if (archivos.length && !$('btn-validar').disabled) validar();
  }

  $('btn-validar').addEventListener('click', validar);

  async function validar() {
    const fd = new FormData();
    archivos.forEach((f) => fd.append('archivos', f, f.name));
    $('btn-validar').disabled = true;
    $('btn-validar').textContent = 'Validando…';
    $('btn-abrir').classList.add('oculto');
    try {
      const resp = await fetch('/api/cargar', { method: 'POST', headers: { 'x-clave': clave }, body: fd });
      ultimaValidacion = await resp.json();
    } catch (e) {
      ultimaValidacion = { ok: false, errores: ['No se pudo contactar al servidor.'], avisos: [] };
    }
    $('btn-validar').disabled = false;
    $('btn-validar').textContent = 'Validar Excel';
    pintarValidacion();
  }

  function pintarValidacion() {
    const v = ultimaValidacion;
    const items = [];
    if (v) {
      if (v.ok) items.push(el('li', { class: 'ok' }, `✅ "${v.config.nombre_juego}": ${v.preguntas.length} pregunta(s) listas. Ranking después de cada pregunta: ${v.config.mostrar_ranking ? 'sí' : 'no'}.`));
      else items.push(el('li', { class: 'err' }, `❌ Se encontraron ${v.errores.length} error(es). Corrige el Excel y vuelve a cargarlo.`));
      (v.errores || []).forEach((m) => items.push(el('li', { class: 'err' }, m)));
      (v.avisos || []).forEach((m) => items.push(el('li', { class: 'warn' }, '⚠️ ' + m)));
    } else if (estado && estado.cargado) {
      items.push(el('li', { class: 'ok' }, `✅ Cuestionario cargado: "${estado.cargado.nombre}" (${estado.cargado.total} preguntas). Puedes abrir la sala o cargar otro Excel.`));
    } else {
      items.push(el('li', { class: 'suave', style: 'padding:0' }, 'Carga un Excel para ver aquí las preguntas y los posibles errores.'));
    }
    $('mensajes').replaceChildren(...items);

    const tabla = $('tabla');
    if (v && v.ok) {
      tabla.classList.remove('oculto');
      tabla.tBodies[0].replaceChildren(...v.preguntas.map((p) => el('tr', {},
        el('td', {}, p.numero),
        el('td', {}, el('span', { class: 'etq ' + p.tipo }, p.tipo)),
        el('td', {}, p.texto),
        el('td', {}, p.imagen ? el('img', { src: p.imagen, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : '—'),
        el('td', {}, p.opciones.map((o) => el('span', { class: 'op-mini' + (p.correctas.includes(o.letra) ? ' ok' : '') }, `${o.letra}. ${o.texto}`))),
        el('td', {}, p.tiempo),
        el('td', {}, p.puntos),
      )));
    } else tabla.classList.add('oculto');

    const puedeAbrir = (v && v.ok) || (!v && estado && estado.cargado);
    $('btn-abrir').classList.toggle('oculto', !puedeAbrir);
  }

  $('btn-abrir').addEventListener('click', () => {
    socket.emit('maestro:abrir', null, (r) => {
      if (!r || !r.ok) $('pie-error').textContent = (r && r.error) || 'No se pudo abrir la sala.';
    });
  });

  // ------------------------------------------------------------ Render
  function mostrarVista(id) {
    VISTAS.forEach((v) => $(v).classList.toggle('oculto', v !== id));
  }

  function botonAvanzar(texto, deshabilitado) {
    const b = $('btn-avanzar');
    if (!texto) { b.classList.add('oculto'); return; }
    b.classList.remove('oculto');
    b.textContent = texto;
    b.disabled = Boolean(deshabilitado);
  }

  function render(e) {
    const anterior = estado;
    estado = e;
    const clave2 = `${e.fase}-${e.numero || 0}`;
    const nuevaVista = clave2 !== claveVista;
    claveVista = clave2;
    clearInterval(reloj);
    $('btn-nuevo').classList.toggle('oculto', e.fase === 'sin_juego');
    $('btn-resultados').classList.toggle('oculto', e.fase !== 'podio');
    $('pie-info').textContent = e.pin && e.fase !== 'lobby' ? `PIN ${e.pin} · ${e.conectados} conectados` : '';

    if (e.fase === 'sin_juego') {
      mostrarVista('v-carga');
      botonAvanzar(null);
      if (anterior && anterior.fase !== 'sin_juego') ultimaValidacion = null;
      pintarValidacion();
    } else if (e.fase === 'lobby') {
      mostrarVista('v-lobby');
      pintarLobby(e, nuevaVista);
      botonAvanzar(e.jugadores.length ? `Comenzar ▶ (${e.jugadores.length})` : 'Esperando jugadores…', !e.jugadores.length);
    } else if (e.fase === 'pregunta' || e.fase === 'revelacion') {
      mostrarVista('v-pregunta');
      pintarPregunta(e, nuevaVista);
      if (e.fase === 'pregunta') botonAvanzar('Cerrar pregunta ⏭');
      else botonAvanzar(e.esUltima ? 'Ver podio 🏆' : e.mostrarRanking ? 'Ver ranking ➜' : 'Siguiente pregunta ➜');
    } else if (e.fase === 'ranking') {
      mostrarVista('v-ranking');
      pintarRanking(e);
      botonAvanzar(e.esUltima ? 'Ver podio 🏆' : 'Siguiente pregunta ➜');
    } else if (e.fase === 'podio') {
      mostrarVista('v-podio');
      botonAvanzar(null);
      if (nuevaVista) pintarPodio(e);
    }
  }

  function pintarLobby(e, nueva) {
    const url = `${location.origin}/?pin=${e.pin}`;
    if (nueva) {
      $('url-acceso').textContent = location.host;
      $('pin').textContent = e.pin;
      $('qr').src = `/api/qr?texto=${encodeURIComponent(url)}`;
      $('nombre-juego').textContent = e.nombre;
    }
    $('num-jugadores').textContent = e.jugadores.length;
    const actuales = new Map([...$('jugadores').children].map((n) => [n.dataset.token, n]));
    const nodos = e.jugadores.map((j) => {
      let n = actuales.get(j.token);
      if (!n) {
        n = el('div', { class: 'jugador', title: 'Clic para retirar', 'data-token': j.token }, j.nombre);
        n.addEventListener('click', () => {
          if (confirm(`¿Retirar a "${j.nombre}" del juego?`)) socket.emit('maestro:expulsar', { token: j.token });
        });
      }
      n.classList.toggle('desconectado', !j.conectado);
      return n;
    });
    $('jugadores').replaceChildren(...nodos);
  }

  function tamTexto(t) {
    const n = t.length;
    if (n <= 60) return 'clamp(26px, 3.4vw, 54px)';
    if (n <= 120) return 'clamp(22px, 2.7vw, 42px)';
    return 'clamp(18px, 2.1vw, 32px)';
  }

  function pintarPregunta(e, nueva) {
    const p = e.pregunta;
    const revelado = e.fase === 'revelacion';
    if (nueva) {
      $('q-num').textContent = `Pregunta ${e.numero} de ${e.total}`;
      $('q-tipo').textContent = NOMBRE_TIPO[p.tipo];
      $('q-tipo').className = 'etq ' + p.tipo;
      $('q-texto').textContent = p.texto;
      $('q-texto').style.fontSize = tamTexto(p.texto);
      const media = $('q-media');
      if (p.imagen) {
        const img = el('img', { src: p.imagen, alt: '', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => media.replaceChildren(el('div', { class: 'sin-img' }, '(No se pudo cargar la imagen)')));
        media.replaceChildren(img);
        media.classList.remove('vacia');
      } else {
        media.replaceChildren();
        media.classList.add('vacia');
      }
      $('q-opciones').replaceChildren(...p.opciones.map((o) => {
        const c = colorOpcion(p.tipo, o.letra);
        return el('div', { class: 'opcion', 'data-letra': o.letra, style: `background:${c.fondo}` },
          el('span', { class: 'letra' }, p.tipo === 'VF' ? c.icono : o.letra),
          el('span', { class: 'texto' }, o.texto),
          el('span', { class: 'conteo' }, el('span', { class: 'n' }, '0'), '👤'),
          el('span', { class: 'barra-conteo' }));
      }));
    }
    $('q-opciones').classList.toggle('revelado', revelado);
    $('q-resp').textContent = `${e.respondieron}/${e.conectados}`;
    $('q-anillo').classList.toggle('oculto', revelado);

    if (!revelado) {
      $('q-resumen').classList.add('oculto');
      const fin = Date.now() + e.restanteMs;
      const total = p.tiempo * 1000;
      const circ = 163.36;
      const tick = () => {
        const resta = Math.max(0, fin - Date.now());
        const s = Math.ceil(resta / 1000);
        $('q-seg').textContent = s;
        $('q-anillo').classList.toggle('urgente', s <= 5);
        $('q-anillo').querySelector('.barra-a').style.strokeDashoffset = String(circ * (1 - resta / total));
        if (resta <= 0) clearInterval(reloj);
      };
      tick();
      reloj = setInterval(tick, 100);
    } else {
      const max = Math.max(1, ...Object.values(e.conteo));
      [...$('q-opciones').children].forEach((n) => {
        const l = n.dataset.letra;
        const ok = p.correctas.includes(l);
        n.classList.toggle('correcta', ok);
        n.classList.toggle('no-correcta', !ok);
        n.querySelector('.n').textContent = e.conteo[l] || 0;
        requestAnimationFrame(() => { n.querySelector('.barra-conteo').style.width = `${((e.conteo[l] || 0) / max) * 100}%`; });
      });
      const total = e.jugadores.length;
      $('q-resumen').textContent = p.tipo === 'MULTIPLE'
        ? `${e.correctos} de ${total} marcaron todas las correctas`
        : `${e.correctos} de ${total} acertaron`;
      $('q-resumen').classList.remove('oculto');
    }
  }

  function pintarRanking(e) {
    $('rank-sub').textContent = `Después de la pregunta ${e.numero} de ${e.total}`;
    $('ranking').replaceChildren(...e.ranking.map((r, i) => el('div', { class: `fila-rank p${r.pos}`, style: `animation-delay:${i * 0.07}s` },
      el('span', { class: 'pos' }, r.pos),
      el('span', { class: 'nom' }, r.nombre),
      el('span', { class: 'ganado' }, r.ganado ? `+${fmt(r.ganado)}` : ''),
      el('span', {}, fmt(r.puntaje)),
    )));
    if (!e.ranking.length) $('ranking').append(el('p', { class: 'suave', style: 'text-align:center' }, 'Sin jugadores.'));
  }

  function pintarPodio(e) {
    const porPuesto = {};
    e.ranking.forEach((r) => { porPuesto[r.pos] = r; });
    const orden = [2, 1, 3];
    const metal = { 1: 'oro', 2: 'plata', 3: 'bronce' };
    const cols = orden.map((pos) => {
      const r = porPuesto[pos];
      return el('div', { class: `puesto p${pos}`, 'data-pos': pos },
        r ? el('div', { class: 'cont-buho' }) : null,
        el('div', { class: 'nombre-p' }, r ? r.nombre : '—'),
        el('div', { class: 'pts-p' }, r ? `${fmt(r.puntaje)} pts` : ''),
        el('div', { class: 'escalon' }, pos));
    });
    $('podio').replaceChildren(...cols);
    cols.forEach((c) => {
      const pos = Number(c.dataset.pos);
      const cont = c.querySelector('.cont-buho');
      if (cont) cont.innerHTML = buhoSVG(metal[pos]);
    });
    // Suspenso: primero bronce, luego plata y al final oro con confeti.
    const mostrar = (pos, ms) => setTimeout(() => {
      const c = $('podio').querySelector(`[data-pos="${pos}"]`);
      if (c) c.classList.add('visible');
      if (pos === 1) { confeti(260); setTimeout(() => confeti(160), 1200); }
    }, ms);
    mostrar(3, 400);
    mostrar(2, 1800);
    mostrar(1, 3400);
  }
})();
