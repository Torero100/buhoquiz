// Pantalla del participante (celular).
(function () {
  const { colorOpcion, buhoSVG, confeti, el, guardar, leer, borrar, fmt } = window.Buho;
  const $ = (id) => document.getElementById(id);
  const PANTALLAS = ['unirse', 'espera', 'responder', 'enviado', 'resultado', 'final', 'mensaje'];

  $('logo').innerHTML = buhoSVG('azul');
  $('buho-espera').innerHTML = buhoSVG('azul');

  let sesion = leer('buhoquiz_sesion'); // { pin, token, nombre }
  let estado = null;
  let claveFase = '';
  let seleccion = new Set();
  let reloj = null;

  const params = new URLSearchParams(location.search);
  if (params.get('pin')) $('pin').value = params.get('pin').replace(/\D/g, '').slice(0, 6);
  else if (sesion && sesion.pin) $('pin').value = sesion.pin;
  if (sesion && sesion.nombre) $('nombre').value = sesion.nombre;

  function mostrar(id) {
    PANTALLAS.forEach((p) => $(p).classList.toggle('oculto', p !== id));
  }

  function mensaje(texto) {
    $('mensaje-texto').textContent = texto;
    mostrar('mensaje');
  }

  const socket = io({ auth: { rol: 'jugador' }, transports: ['websocket', 'polling'] });

  function unirse(datos, silencioso) {
    socket.emit('jugador:unirse', datos, (r) => {
      if (r && r.ok) {
        sesion = { pin: r.pin, token: r.token, nombre: r.nombre };
        guardar('buhoquiz_sesion', sesion);
        $('error-unirse').textContent = '';
      } else {
        if (datos.token) { borrar('buhoquiz_sesion'); sesion = null; }
        if (!silencioso) $('error-unirse').textContent = (r && r.error) || 'No se pudo entrar.';
        mostrar('unirse');
      }
    });
  }

  socket.on('connect', () => {
    // Reconexión automática si ya estaba en este juego
    if (sesion && sesion.token) {
      const pinUrl = params.get('pin');
      if (!pinUrl || pinUrl === sesion.pin) unirse({ pin: sesion.pin, token: sesion.token }, true);
    }
  });

  $('form-unirse').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const pin = $('pin').value.replace(/\D/g, '');
    const nombre = $('nombre').value.trim();
    if (pin.length !== 6) { $('error-unirse').textContent = 'El PIN tiene 6 dígitos.'; return; }
    if (!nombre) { $('error-unirse').textContent = 'Escribe tu nombre o apodo.'; return; }
    const token = sesion && sesion.pin === pin ? sesion.token : undefined;
    unirse({ pin, nombre, token });
  });

  socket.on('expulsado', () => { borrar('buhoquiz_sesion'); sesion = null; mensaje('El maestro te retiró del juego.'); });
  socket.on('fin_sesion', () => { borrar('buhoquiz_sesion'); sesion = null; mensaje('El juego terminó. ¡Gracias por participar!'); });
  socket.on('disconnect', () => { /* socket.io reintenta solo */ });

  socket.on('estado', (e) => {
    estado = e;
    const clave = `${e.fase}-${e.numero}-${e.respondida ? 1 : 0}`;
    const cambioFase = clave !== claveFase;
    claveFase = clave;
    clearInterval(reloj);

    if (e.fase === 'lobby') {
      $('espera-nombre').textContent = e.nombre;
      mostrar('espera');
    } else if (e.fase === 'pregunta') {
      if (e.respondida) pintarEnviado(e);
      else pintarPregunta(e, cambioFase);
    } else if (e.fase === 'revelacion' || e.fase === 'ranking') {
      pintarResultado(e, cambioFase && e.fase === 'revelacion');
    } else if (e.fase === 'podio') {
      pintarFinal(e, cambioFase);
    }
  });

  function iniciarReloj(e) {
    const fin = Date.now() + e.restanteMs;
    const tick = () => {
      const s = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      $('r-reloj').textContent = s;
      $('r-reloj').classList.toggle('urgente', s <= 5);
      if (s <= 0) clearInterval(reloj);
    };
    tick();
    reloj = setInterval(tick, 200);
  }

  function pintarPregunta(e, nueva) {
    mostrar('responder');
    $('r-numero').textContent = `Pregunta ${e.numero}/${e.total}`;
    $('r-nombre').textContent = e.nombre;
    $('r-error').textContent = '';
    iniciarReloj(e);
    if (!nueva) return;

    seleccion = new Set();
    const p = e.pregunta;
    const multiple = p.tipo === 'MULTIPLE';
    $('r-aviso').textContent = multiple ? '✨ Varias respuestas correctas: marca todas y pulsa Enviar' : p.tipo === 'VF' ? '¿Verdadero o falso?' : 'Elige una respuesta';
    const rejilla = $('r-rejilla');
    rejilla.className = 'rejilla' + (p.opciones.length === 2 ? ' dos' : '') + (multiple ? ' multiple' : '');
    rejilla.replaceChildren(...p.opciones.map((o) => {
      const c = colorOpcion(p.tipo, o.letra);
      const b = el('button', { class: 'opcion', type: 'button', style: `background:${c.fondo}`, 'aria-pressed': 'false' },
        el('span', { class: 'letra' }, p.tipo === 'VF' ? c.icono : o.letra),
        el('span', { class: 'texto' }, o.texto));
      b.addEventListener('click', () => {
        if (multiple) {
          if (seleccion.has(o.letra)) seleccion.delete(o.letra); else seleccion.add(o.letra);
          b.classList.toggle('marcada', seleccion.has(o.letra));
          b.setAttribute('aria-pressed', String(seleccion.has(o.letra)));
          $('r-enviar').disabled = seleccion.size === 0;
        } else {
          enviar([o.letra]);
        }
      });
      return b;
    }));
    $('r-enviar').classList.toggle('oculto', !multiple);
    $('r-enviar').disabled = true;
  }

  $('r-enviar').addEventListener('click', () => { if (seleccion.size) enviar([...seleccion]); });

  let enviando = false;
  function enviar(letras) {
    if (enviando) return;
    enviando = true;
    if (navigator.vibrate) try { navigator.vibrate(40); } catch (err) { /* nada */ }
    socket.emit('jugador:responder', { letras }, (r) => {
      enviando = false;
      if (!r || !r.ok) $('r-error').textContent = (r && r.error) || 'No se pudo enviar.';
    });
  }

  function pintarEnviado(e) {
    mostrar('enviado');
    const p = e.pregunta;
    $('enviado-chips').replaceChildren(...(e.misLetras || []).map((l) => {
      const o = p.opciones.find((x) => x.letra === l);
      const c = colorOpcion(p.tipo, l);
      return el('span', { class: 'chip', style: `background:${c.fondo}` }, p.tipo === 'VF' ? o.texto : `${l}. ${o.texto}`);
    }));
  }

  function pintarResultado(e, animar) {
    const r = e.resultado || { resultado: 'sin_respuesta', puntos: 0 };
    const textos = {
      correcto: ['🎉', '¡Correcto!'],
      parcial: ['👍', '¡Casi! Respuesta parcial'],
      incorrecto: ['😕', 'Incorrecto'],
      sin_respuesta: ['⏰', 'Se acabó el tiempo'],
    }[r.resultado];
    const caja = $('res-caja');
    caja.className = 'resultado ' + r.resultado;
    const detalle = r.tipo === 'MULTIPLE' && r.resultado !== 'sin_respuesta'
      ? el('div', { style: 'margin-top:6px;font-size:16px' }, `Acertaste ${r.aciertos} de ${r.totalCorrectas}` + (r.errores ? ` · ${r.errores} incorrecta${r.errores > 1 ? 's' : ''} (resta)` : ''))
      : null;
    caja.replaceChildren(
      el('div', { class: 'icono-grande' }, textos[0]),
      el('h2', {}, textos[1]),
      el('div', { class: 'pts' }, `+${fmt(r.puntos)} pts`),
      detalle,
    );
    if (!animar) caja.style.animation = 'none';
    else caja.style.animation = '';
    $('res-total').textContent = `${fmt(e.puntaje)} pts`;
    $('res-puesto').textContent = e.posicion ? `Vas en el puesto ${e.posicion} de ${e.jugadores}` : '';
    mostrar('resultado');
    if (animar && r.resultado === 'correcto') confeti(70);
  }

  function pintarFinal(e, animar) {
    const metal = { 1: 'oro', 2: 'plata', 3: 'bronce' }[e.posicion];
    $('final-buho').innerHTML = buhoSVG(metal || 'azul');
    $('final-buho').style.width = '190px';
    $('final-puesto').textContent = e.posicion ? `#${e.posicion}` : '';
    $('final-titulo').textContent = metal
      ? { oro: '¡Ganaste el Búho de Oro!', plata: '¡Búho de Plata para ti!', bronce: '¡Te llevas el Búho de Bronce!' }[metal]
      : `¡Gracias por jugar, ${e.nombre}!`;
    $('final-puntaje').textContent = `${fmt(e.puntaje)} pts`;
    mostrar('final');
    if (animar && metal) setTimeout(() => confeti(180), 300);
  }
})();
