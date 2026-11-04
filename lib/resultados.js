// Genera el Excel de resultados al final del juego.
const ExcelJS = require('exceljs');

const ETIQUETA = { correcto: 'Correcta', parcial: 'Parcial', incorrecto: 'Incorrecta', sin_respuesta: 'Sin responder' };

function estilizarEncabezado(ws) {
  const fila = ws.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1769E0' } };
  fila.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function crearExcelResultados(juego, ranking) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BúhoQuiz';
  const preguntas = juego.preguntas.slice(0, juego.preguntasJugadas);

  const wsR = wb.addWorksheet('Ranking');
  wsR.columns = [
    { header: 'Puesto', key: 'pos', width: 8 },
    { header: 'Jugador', key: 'nombre', width: 24 },
    { header: 'Puntaje', key: 'puntaje', width: 10 },
    { header: 'Correctas', key: 'c', width: 10 },
    { header: 'Parciales', key: 'p', width: 10 },
    { header: 'Incorrectas', key: 'i', width: 11 },
    { header: 'Sin responder', key: 's', width: 13 },
    { header: 'Tiempo total (s)', key: 't', width: 15 },
  ];
  for (const r of ranking) {
    const j = juego.jugadores.get(r.token);
    const cuenta = { correcto: 0, parcial: 0, incorrecto: 0, sin_respuesta: 0 };
    for (const p of preguntas) cuenta[(j.respuestas[p.numero] || { resultado: 'sin_respuesta' }).resultado]++;
    wsR.addRow({ pos: r.pos, nombre: j.nombre, puntaje: j.puntaje, c: cuenta.correcto, p: cuenta.parcial, i: cuenta.incorrecto, s: cuenta.sin_respuesta, t: Math.round(j.tiempoTotal / 100) / 10 });
  }
  estilizarEncabezado(wsR);

  const wsD = wb.addWorksheet('Detalle');
  wsD.columns = [
    { header: 'Jugador', key: 'nombre', width: 22 },
    { header: 'N°', key: 'n', width: 5 },
    { header: 'Pregunta', key: 'texto', width: 45 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Marcó', key: 'marco', width: 10 },
    { header: 'Correctas', key: 'correctas', width: 10 },
    { header: 'Resultado', key: 'res', width: 13 },
    { header: 'Puntos', key: 'puntos', width: 9 },
    { header: 'Tiempo (s)', key: 'seg', width: 10 },
  ];
  for (const r of ranking) {
    const j = juego.jugadores.get(r.token);
    for (const p of preguntas) {
      const a = j.respuestas[p.numero];
      wsD.addRow({
        nombre: j.nombre, n: p.numero, texto: p.texto, tipo: p.tipo,
        marco: a && a.letras.length ? a.letras.join(';') : '-',
        correctas: p.correctas.join(';'),
        res: ETIQUETA[a ? a.resultado : 'sin_respuesta'],
        puntos: a ? a.puntos : 0,
        seg: a && a.letras.length ? Math.round(a.ms / 100) / 10 : '',
      });
    }
  }
  estilizarEncabezado(wsD);

  const wsP = wb.addWorksheet('Preguntas');
  wsP.columns = [
    { header: 'N°', key: 'n', width: 5 },
    { header: 'Pregunta', key: 'texto', width: 45 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Correctas', key: 'correctas', width: 10 },
    { header: 'Respondieron', key: 'resp', width: 13 },
    { header: '% correcta', key: 'pc', width: 11 },
    { header: 'Marcaron A', key: 'A', width: 11 },
    { header: 'Marcaron B', key: 'B', width: 11 },
    { header: 'Marcaron C', key: 'C', width: 11 },
    { header: 'Marcaron D', key: 'D', width: 11 },
  ];
  for (const p of preguntas) {
    const conteo = { A: 0, B: 0, C: 0, D: 0 };
    let resp = 0; let ok = 0; let total = 0;
    for (const j of juego.jugadores.values()) {
      const a = j.respuestas[p.numero];
      if (!a) continue;
      total++;
      if (a.letras.length) resp++;
      if (a.resultado === 'correcto') ok++;
      for (const l of a.letras) conteo[l]++;
    }
    wsP.addRow({ n: p.numero, texto: p.texto, tipo: p.tipo, correctas: p.correctas.join(';'), resp, pc: total ? Math.round((ok / total) * 100) + '%' : '-', ...conteo });
  }
  estilizarEncabezado(wsP);

  return wb.xlsx.writeBuffer();
}

module.exports = { crearExcelResultados };
