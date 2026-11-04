// Utilidades compartidas: colores de opciones, búhos SVG y confeti.
(function () {
  const COLORES = {
    A: { fondo: '#e8336d', icono: '★' },
    B: { fondo: '#1e7bff', icono: '◆' },
    C: { fondo: '#f2a20c', icono: '●' },
    D: { fondo: '#14b87a', icono: '■' },
  };
  const COLORES_VF = {
    A: { fondo: '#14b87a', icono: '✔' },
    B: { fondo: '#e8336d', icono: '✖' },
  };
  function colorOpcion(tipo, letra) {
    return (tipo === 'VF' ? COLORES_VF : COLORES)[letra] || COLORES.A;
  }

  const NOMBRE_TIPO = { UNICA: 'Una respuesta', VF: 'Verdadero o falso', MULTIPLE: 'Varias respuestas' };

  const PALETAS = {
    oro: { luz: '#fff7c2', base: '#ffcc2e', sombra: '#e08f00', borde: '#7a4c00', panza: '#fff0a0', disco: '#fffbe6' },
    plata: { luz: '#ffffff', base: '#d6e0ea', sombra: '#8e9fb2', borde: '#3e4b5b', panza: '#eef3f8', disco: '#ffffff' },
    bronce: { luz: '#ffd9b3', base: '#dc8a48', sombra: '#a14f19', borde: '#552808', panza: '#ffcf9e', disco: '#fff0e0' },
    azul: { luz: '#a8e6ff', base: '#2f8cff', sombra: '#1450c4', borde: '#0a2566', panza: '#c4ecff', disco: '#eaf7ff' },
  };

  function estrella(x, y, r, color, retraso) {
    const p = [];
    for (let i = 0; i < 8; i++) {
      const rad = (Math.PI / 4) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.35;
      p.push(`${(x + Math.cos(rad) * rr).toFixed(1)},${(y + Math.sin(rad) * rr).toFixed(1)}`);
    }
    return `<polygon class="destello" style="animation-delay:${retraso}s" points="${p.join(' ')}" fill="${color}"/>`;
  }

  /** Dibuja un búho. tipo: oro | plata | bronce | azul */
  function buhoSVG(tipo = 'azul') {
    const c = PALETAS[tipo] || PALETAS.azul;
    const id = 'b' + Math.random().toString(36).slice(2, 8);
    const puesto = { oro: 1, plata: 2, bronce: 3 }[tipo];
    const trazo = `stroke="${c.borde}" stroke-width="4" stroke-linejoin="round"`;

    const plumas = [];
    [[140, [84, 100, 116]], [158, [76, 92, 108, 124]], [176, [84, 100, 116]]].forEach(([y, xs]) => {
      xs.forEach((x) => plumas.push(`M${x - 6} ${y} q6 7 12 0`));
    });

    let extra = '';
    if (tipo === 'oro') {
      extra += `<g class="corona"><path d="M72 44 L78 12 L91 30 L100 4 L109 30 L122 12 L128 44 Z" fill="#ffe14d" ${trazo}/>
        <circle cx="100" cy="34" r="5" fill="#e8336d" stroke="${c.borde}" stroke-width="2"/>
        <circle cx="84" cy="38" r="3.5" fill="#1e7bff"/><circle cx="116" cy="38" r="3.5" fill="#14b87a"/></g>`;
      extra += estrella(22, 40, 11, '#fff3a0', 0) + estrella(180, 60, 9, '#fff3a0', 0.6) + estrella(178, 168, 7, '#ffffff', 1.1) + estrella(18, 150, 8, '#ffffff', 0.3);
    } else if (tipo === 'plata') {
      extra += estrella(24, 52, 8, '#ffffff', 0.2) + estrella(178, 70, 7, '#e6f0ff', 0.9);
    } else if (tipo === 'bronce') {
      extra += estrella(22, 60, 7, '#ffe0c0', 0.5);
    } else if (tipo === 'azul') {
      // Birrete de graduación
      extra += `<g class="birrete"><path d="M52 40 L100 20 L148 40 L100 60 Z" fill="#0b1630" stroke="#00d4ff" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M72 48 L72 62 Q100 74 128 62 L128 48" fill="#13224a" stroke="#00d4ff" stroke-width="2.5"/>
        <path d="M100 40 L146 52 L146 74" fill="none" stroke="#ffcc2e" stroke-width="3"/><circle cx="146" cy="78" r="5" fill="#ffcc2e"/></g>`;
    }

    const medalla = puesto
      ? `<g class="medalla"><path d="M86 130 L100 152 L114 130" fill="none" stroke="#e8336d" stroke-width="8" stroke-linecap="round"/>
         <circle cx="100" cy="168" r="19" fill="url(#${id}c)" ${trazo}/>
         <text x="100" y="176" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="700" font-size="22" fill="${c.borde}">${puesto}</text></g>`
      : '';

    return `<svg class="buho buho-${tipo}" viewBox="0 0 200 232" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Búho ${tipo}">
  <defs>
    <linearGradient id="${id}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.luz}"/><stop offset=".45" stop-color="${c.base}"/><stop offset="1" stop-color="${c.sombra}"/></linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.base}"/><stop offset="1" stop-color="${c.sombra}"/></linearGradient>
    <radialGradient id="${id}p" cx=".5" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${c.panza}"/></radialGradient>
    <radialGradient id="${id}o" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#3a5dbb"/><stop offset="1" stop-color="#081028"/></radialGradient>
  </defs>
  <ellipse cx="100" cy="224" rx="56" ry="7" fill="#000" opacity=".28"/>
  <path d="M54 66 L40 20 L84 46 Z" fill="url(#${id}a)" ${trazo}/>
  <path d="M146 66 L160 20 L116 46 Z" fill="url(#${id}a)" ${trazo}/>
  <g class="ala ala-izq"><path d="M42 104 C8 118 10 178 50 194 C54 162 56 130 42 104 Z" fill="url(#${id}a)" ${trazo}/></g>
  <g class="ala ala-der"><path d="M158 104 C192 118 190 178 150 194 C146 162 144 130 158 104 Z" fill="url(#${id}a)" ${trazo}/></g>
  <path d="M100 38 C152 38 172 82 170 130 C168 184 140 212 100 212 C60 212 32 184 30 130 C28 82 48 38 100 38 Z" fill="url(#${id}c)" ${trazo}/>
  <ellipse cx="100" cy="160" rx="45" ry="46" fill="url(#${id}p)"/>
  <path d="${plumas.join(' ')}" fill="none" stroke="${c.sombra}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <circle cx="72" cy="96" r="30" fill="${c.disco}" ${trazo}/>
  <circle cx="128" cy="96" r="30" fill="${c.disco}" ${trazo}/>
  <circle cx="72" cy="97" r="18" fill="url(#${id}o)"/><circle cx="128" cy="97" r="18" fill="url(#${id}o)"/>
  <circle cx="78" cy="90" r="6.5" fill="#fff"/><circle cx="134" cy="90" r="6.5" fill="#fff"/>
  <circle cx="66" cy="104" r="2.8" fill="#fff"/><circle cx="122" cy="104" r="2.8" fill="#fff"/>
  <ellipse class="parpado" cx="72" cy="96" rx="27" ry="27" fill="${c.base}"/>
  <ellipse class="parpado" cx="128" cy="96" rx="27" ry="27" fill="${c.base}"/>
  <ellipse cx="46" cy="124" rx="9" ry="5" fill="#ff6fa5" opacity=".5"/><ellipse cx="154" cy="124" rx="9" ry="5" fill="#ff6fa5" opacity=".5"/>
  <path d="M90 114 L110 114 L100 132 Z" fill="#ff9f1c" stroke="#9c4f00" stroke-width="3" stroke-linejoin="round"/>
  <g fill="#ff9f1c" stroke="#9c4f00" stroke-width="2.5">
    <ellipse cx="74" cy="212" rx="6" ry="8"/><ellipse cx="86" cy="213" rx="6" ry="8"/>
    <ellipse cx="114" cy="213" rx="6" ry="8"/><ellipse cx="126" cy="212" rx="6" ry="8"/>
  </g>
  ${medalla}
  ${extra}
</svg>`;
  }

  // ---- Confeti ----
  let lienzo = null;
  let particulas = [];
  let animando = false;
  function confeti(cantidad = 160) {
    if (!lienzo) {
      lienzo = document.createElement('canvas');
      lienzo.className = 'confeti';
      document.body.appendChild(lienzo);
    }
    const ctx = lienzo.getContext('2d');
    const ajustar = () => { lienzo.width = innerWidth * devicePixelRatio; lienzo.height = innerHeight * devicePixelRatio; };
    ajustar();
    const colores = ['#ffcc2e', '#2f8cff', '#00d4ff', '#e8336d', '#14b87a', '#ffffff'];
    for (let i = 0; i < cantidad; i++) {
      particulas.push({
        x: Math.random() * lienzo.width,
        y: -20 - Math.random() * lienzo.height * 0.5,
        vx: (Math.random() - 0.5) * 4 * devicePixelRatio,
        vy: (2 + Math.random() * 4) * devicePixelRatio,
        r: (4 + Math.random() * 6) * devicePixelRatio,
        giro: Math.random() * Math.PI,
        vg: (Math.random() - 0.5) * 0.3,
        color: colores[i % colores.length],
      });
    }
    if (animando) return;
    animando = true;
    const paso = () => {
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      particulas = particulas.filter((p) => p.y < lienzo.height + 30);
      for (const p of particulas) {
        p.x += p.vx; p.y += p.vy; p.giro += p.vg; p.vx *= 0.995;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.giro);
        ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (particulas.length) requestAnimationFrame(paso);
      else { animando = false; ctx.clearRect(0, 0, lienzo.width, lienzo.height); }
    };
    requestAnimationFrame(paso);
  }

  function el(tag, attrs = {}, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
    }
    for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) e.append(h instanceof Node ? h : document.createTextNode(String(h)));
    return e;
  }

  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }

  const fmt = (n) => Number(n || 0).toLocaleString('es-PE');

  window.Buho = { colorOpcion, NOMBRE_TIPO, buhoSVG, confeti, el, guardar, leer, borrar, fmt };
})();
