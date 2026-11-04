// Genera public/plantilla_buhoquiz.xlsx (plantilla con ejemplos, listas desplegables e instrucciones).
// Uso: npm run plantilla  [ruta_extra_de_copia]
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const AZUL = 'FF1769E0';
const FILAS_VALIDADAS = 300;

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BúhoQuiz';

  // ---------------- Hoja preguntas ----------------
  const ws = wb.addWorksheet('preguntas', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'orden', key: 'orden', width: 8 },
    { header: 'tipo', key: 'tipo', width: 12 },
    { header: 'pregunta', key: 'pregunta', width: 48 },
    { header: 'imagen', key: 'imagen', width: 34 },
    { header: 'opcion_A', key: 'A', width: 20 },
    { header: 'opcion_B', key: 'B', width: 20 },
    { header: 'opcion_C', key: 'C', width: 20 },
    { header: 'opcion_D', key: 'D', width: 20 },
    { header: 'respuesta', key: 'respuesta', width: 12 },
    { header: 'tiempo_seg', key: 'tiempo', width: 11 },
    { header: 'puntos', key: 'puntos', width: 9 },
  ];
  const ejemplos = [
    { orden: 1, tipo: 'UNICA', pregunta: '¿Cuál es la capital del departamento de Cusco?', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Plaza_de_Cusco_Allison_Bellido.jpg/330px-Plaza_de_Cusco_Allison_Bellido.jpg', A: 'Juliaca', B: 'Cusco', C: 'Machu Picchu', D: 'Sacsayhuamán', respuesta: 'B', tiempo: 20, puntos: 1000 },
    { orden: 2, tipo: 'VF', pregunta: 'En un día despejado, el cielo se ve azul.', imagen: '', A: 'Verdadero', B: 'Falso', C: '', D: '', respuesta: 'A', tiempo: 15, puntos: 1000 },
    { orden: 3, tipo: 'UNICA', pregunta: '¿De qué raza es el perro de la imagen?', imagen: 'https://eq2imhfmrcc.exactdn.com/wp-content/uploads/2016/08/golden-retriever.jpg?strip=all', A: 'Golden retriever', B: 'Dóberman', C: 'Pitbull', D: 'Bull terrier', respuesta: 'A', tiempo: 20, puntos: 1000 },
    { orden: 4, tipo: 'MULTIPLE', pregunta: '¿Qué podemos encontrar normalmente en una sala?', imagen: '', A: 'Mesa de centro', B: 'Cocina', C: 'Sillón', D: 'Televisor', respuesta: 'A;C;D', tiempo: 25, puntos: 1500 },
  ];
  ejemplos.forEach((e) => ws.addRow(e));

  const enc = ws.getRow(1);
  enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  enc.alignment = { vertical: 'middle', horizontal: 'center' };
  enc.height = 22;
  // Columnas obligatorias en un azul más oscuro
  ['B1', 'C1', 'E1', 'F1', 'I1'].forEach((c) => { ws.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2566' } }; });

  // Notas en los encabezados
  const notas = {
    A1: 'Número de orden en que salen las preguntas (1, 2, 3…). Opcional.',
    B1: 'OBLIGATORIO. UNICA = una correcta · VF = verdadero/falso · MULTIPLE = varias correctas.',
    C1: 'OBLIGATORIO. Texto de la pregunta (recomendado: máx. 120 caracteres).',
    D1: 'Opcional. URL https://… de una imagen, o el nombre del archivo (ej. perro.jpg) que subirás junto al Excel.',
    E1: 'OBLIGATORIO. En VF escribe Verdadero.',
    F1: 'OBLIGATORIO. En VF escribe Falso.',
    G1: 'Opcional. Déjala vacía en VF.',
    H1: 'Opcional. Déjala vacía en VF.',
    I1: 'OBLIGATORIO. Letra(s) correcta(s): B  ·  A;C;D (separadas por punto y coma).',
    J1: 'Opcional. Segundos para responder (5 a 120). Por defecto 20.',
    K1: 'Opcional. Puntaje máximo de la pregunta (100 a 10000). Por defecto 1000.',
  };
  for (const [celda, texto] of Object.entries(notas)) ws.getCell(celda).note = texto;

  for (let r = 2; r <= FILAS_VALIDADAS; r++) {
    ws.getCell(`B${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"UNICA,VF,MULTIPLE"'],
      showErrorMessage: true, errorTitle: 'Tipo no válido', error: 'Elige UNICA, VF o MULTIPLE.',
    };
    ws.getCell(`J${r}`).dataValidation = {
      type: 'whole', operator: 'between', allowBlank: true, formulae: [5, 120],
      showErrorMessage: true, errorTitle: 'Tiempo no válido', error: 'Escribe un número entero entre 5 y 120.',
    };
    ws.getCell(`K${r}`).dataValidation = {
      type: 'whole', operator: 'between', allowBlank: true, formulae: [100, 10000],
      showErrorMessage: true, errorTitle: 'Puntos no válidos', error: 'Escribe un número entero entre 100 y 10000.',
    };
    ws.getCell(`I${r}`).numFmt = '@';
    ['C', 'D', 'E', 'F', 'G', 'H'].forEach((c) => { ws.getCell(`${c}${r}`).alignment = { wrapText: true, vertical: 'top' }; });
  }
  // Bandas de color suaves por tipo (formato condicional)
  ws.addConditionalFormatting({
    ref: `A2:K${FILAS_VALIDADAS}`,
    rules: [
      { type: 'expression', formulae: ['$B2="VF"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE3F7EE' } } } },
      { type: 'expression', formulae: ['$B2="MULTIPLE"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE4EC' } } } },
    ],
  });

  // ---------------- Hoja config ----------------
  const wc = wb.addWorksheet('config');
  wc.columns = [{ header: 'clave', key: 'k', width: 20 }, { header: 'valor', key: 'v', width: 26 }, { header: 'descripción', key: 'd', width: 60 }];
  wc.addRows([
    { k: 'nombre_juego', v: 'BúhoQuiz', d: 'Nombre que se muestra en la sala de espera.' },
    { k: 'tiempo_defecto', v: 20, d: 'Segundos por pregunta cuando la columna tiempo_seg está vacía.' },
    { k: 'puntos_defecto', v: 1000, d: 'Puntos por pregunta cuando la columna puntos está vacía.' },
    { k: 'mostrar_ranking', v: 'SI', d: 'SI = mostrar ranking después de cada pregunta · NO = solo al final.' },
  ]);
  const encC = wc.getRow(1);
  encC.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  wc.getCell('B5').dataValidation = { type: 'list', allowBlank: false, formulae: ['"SI,NO"'] };

  // ---------------- Hoja instrucciones ----------------
  const wi = wb.addWorksheet('instrucciones');
  wi.getColumn(1).width = 110;
  const lineas = [
    ['BúhoQuiz · Cómo llenar esta plantilla', true],
    [''],
    ['1. Escribe una pregunta por fila en la hoja "preguntas". Puedes tener las que quieras (4, 10, 30…).', false],
    ['2. Columna tipo:', true],
    ['     UNICA    → hay una sola respuesta correcta (respuesta: B).', false],
    ['     VF       → verdadero o falso. opcion_A = Verdadero, opcion_B = Falso, C y D vacías (respuesta: A o B).', false],
    ['     MULTIPLE → hay 2 o más correctas (respuesta: A;C;D). Puntaje parcial: cada correcta marcada suma su parte y cada incorrecta marcada resta lo mismo (mínimo 0).', false],
    ['3. Opciones: mínimo opcion_A y opcion_B; máximo 4 (A, B, C, D). No dejes huecos (no llenes D si C está vacía).', false],
    ['4. Imagen (opcional):', true],
    ['     a) Una URL que empiece con https:// (clic derecho sobre la imagen en internet → "Copiar dirección de la imagen").', false],
    ['     b) El nombre de un archivo, por ejemplo perro.jpg. Al cargar el Excel en BúhoQuiz selecciona también ese archivo de imagen.', false],
    ['     Recomendado: opción b) — no depende de que otra página web siga funcionando. Máximo 8 MB por imagen.', false],
    ['5. tiempo_seg (5 a 120) y puntos (100 a 10000) son opcionales; si se dejan vacíos se usan los valores de la hoja "config".', false],
    ['6. Puntaje por rapidez: quien responde al instante recibe el 100% de los puntos; quien responde al final del tiempo, el 50%.', false],
    ['7. Al cargar el Excel, BúhoQuiz lo revisa y muestra los errores fila por fila antes de abrir la sala.', false],
    [''],
    ['No cambies los nombres de las columnas ni de las hojas "preguntas" y "config".', true],
  ];
  lineas.forEach(([t, negrita]) => {
    const row = wi.addRow([t]);
    row.font = { bold: Boolean(negrita), size: negrita && t.startsWith('BúhoQuiz') ? 16 : 11, color: negrita && t.startsWith('BúhoQuiz') ? { argb: AZUL } : undefined };
    row.alignment = { wrapText: true };
  });

  const destino = path.join(__dirname, '..', 'public', 'plantilla_buhoquiz.xlsx');
  await wb.xlsx.writeFile(destino);
  console.log('Plantilla creada:', destino);
  const extra = process.argv[2];
  if (extra) { fs.copyFileSync(destino, extra); console.log('Copia en:', extra); }
}

main().catch((e) => { console.error(e); process.exit(1); });
