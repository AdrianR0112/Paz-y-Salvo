import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from 'pdfmake/build/vfs_fonts.js';
import { calculate, departments } from './expediente.js';

pdfMake.addVirtualFileSystem(fonts);

function table(body, widths = ['*', '*']) {
  return { table: { body, widths, dontBreakRows: true }, layout: 'lightHorizontalLines' };
}

function heading(text) {
  return { text, style: 'heading' };
}

export function createPdf(record, certificate) {
  const { items, gross, deductions, net } = calculate(record);
  const tag = (record.demo ? 'CASO FICTICIO · ' : '') + 'EXPEDIENTE ' + record.id;
  const title = certificate ? 'Certificado de paz y salvo' : 'Liquidación laboral';
  const header = (text, pageBreak) => [
    { text: tag, pageBreak },
    { text, style: 'title' },
  ];
  const identification = () => [
    heading('Identificación'),
    table([
      ['Empleador / RUC', record.empresa + ' / ' + record.ruc],
      ['Trabajador / identificación', record.trabajador + ' / ' + record.cedula],
      ['Cargo / lugar', record.cargo + ' / ' + record.ciudad],
      ['Ingreso / último día', record.ingreso + ' / ' + record.salida],
      ['Causa', [record.causa, record.motivo].filter(Boolean).join(' · ')],
    ]),
  ];
  const signatures = () => ({
    unbreakable: true,
    stack: [
      heading('Firmas'),
      { columns: [
        { text: `__________________________\n${record.representante}\nPor el empleador` },
        { text: `__________________________\n${record.trabajador}\nTrabajador/a` },
      ], margin: [0, 12, 0, 0] },
    ],
  });
  const settlement = [
    ...header('Liquidación laboral', certificate ? 'before' : undefined),
    ...identification(),
    heading('Haberes y deducciones'),
    table([
      ...items,
      ['Total haberes', gross],
      ['Total deducciones', deductions],
      [{ text: 'NETO A PAGAR', bold: true }, { text: net, bold: true }],
    ], ['*', 'auto']),
    heading('Detalle y formalización'),
    { text: [record.detalle, 'Documento de cálculo para revisión y formalización del finiquito en el SUT.'].filter(Boolean).join('\n') },
    signatures(),
  ];
  const certificateContent = certificate ? [
    ...header(title),
    ...identification(),
    heading('Verificaciones internas aprobadas'),
    table(departments.map(([area, task], i) => {
      const row = record.checks[i];
      return [
        `${area}\n${task}`,
        `${row.responsable} · ${row.fecha}\n${row.observacion || 'Sin observaciones'}\nEvidencias: ${row.files.length}`,
      ];
    })),
    { text: 'Se certifica el cierre de las verificaciones internas registradas en este expediente.', margin: [0, 8, 0, 0] },
    heading('Resumen de liquidación'),
    table([['Neto a pagar', net]]),
    signatures(),
  ] : [];
  return pdfMake.createPdf({
    info: { title },
    pageSize: 'A4',
    pageMargins: [48, 45, 48, 49],
    content: [...certificateContent, ...settlement],
    defaultStyle: { fontSize: 10, color: '#17342f' },
    styles: {
      title: { fontSize: 22, bold: true, margin: [0, 3, 0, 5] },
      heading: { fontSize: 13, bold: true, color: '#205c54', margin: [0, 9, 0, 3] },
    },
    footer: page => ({
      columns: ['Expediente laboral · Ecuador', { text: String(page), alignment: 'right' }],
      margin: [48, 10, 48, 0],
      fontSize: 9,
    }),
  });
}
