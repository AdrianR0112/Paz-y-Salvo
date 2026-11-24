import { deleteRecord, listRecords, openRecords, saveRecord } from './almacen.js';
import demo from './caso-ficticio.json';
import { calculate, causes, departments, fields, identity, statuses, validate } from './expediente.js';

const $ = id => document.getElementById(id);
const form = $('form');
const examples = ['01-talento-humano.pdf', '02-activos.pdf', '03-tecnologia.pdf', '04-contabilidad.pdf'];
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const evidenceUrls = [];
let db, records = [], current = {}, dirty = false, busy = false;

function control(parent, key, label, type = 'text', value = '', options = []) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  if (input.tagName === 'INPUT') input.type = type;
  if (type === 'select') options.forEach(option => input.add(new Option(option, option)));
  if (type === 'number') {
    input.min = '0';
    input.step = '0.000001';
    input.required = true;
  }
  if (type === 'text' || type === 'textarea') input.maxLength = 350;
  input.name = key;
  input.value = value;
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}

function link(label, url, download) {
  const a = document.createElement('a');
  a.textContent = label;
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (download) a.download = download;
  return a;
}

function showRecords() {
  $('records').replaceChildren();
  const query = $('search').value.trim().toLowerCase();
  for (const item of records.filter(r => [r.trabajador, r.empresa, r.cedula].some(v => v.toLowerCase().includes(query)))) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.toggle('active', item.id === current.id);
    button.textContent = '#' + item.id + ' · ' + item.trabajador;
    const employer = document.createElement('small');
    employer.textContent = item.empresa;
    button.append(document.createElement('br'), employer);
    button.onclick = () => { if (canLeave()) render(item); };
    $('records').append(button);
  }
  if (!$('records').children.length) $('records').textContent = 'Sin expedientes para mostrar.';
}

function canLeave() {
  return Boolean(db) && !busy && (!dirty || confirm('¿Descartar los cambios pendientes de guardar?'));
}

function updateStatus() {
  const selected = departments.map((_, i) => form.elements['estado' + i].value);
  const approved = selected.filter(x => x === 'Aprobado').length;
  $('progress').textContent = approved + ' de ' + selected.length + ' aprobados';
  selected.forEach((value, i) => {
    const badge = $('badge' + i);
    badge.textContent = value;
    badge.className = 'pill ' + (value === 'Aprobado' ? 'approved' : value === 'Observado' ? 'observed' : '');
  });
  const ready = Boolean(current.id && !dirty && approved === selected.length);
  $('certificate').disabled = !ready;
  let help = 'El certificado y la liquidación se abrirán juntos en un PDF.';
  if (!current.id) {
    help = 'Guarda el expediente y completa las cuatro aprobaciones con evidencia.';
  } else if (approved !== selected.length) {
    const pending = departments.filter((_, i) => selected[i] !== 'Aprobado').map(([area]) => area);
    help = 'Falta aprobación en ' + pending.join(', ') + '.';
  } else if (dirty) {
    help = 'Guarda los cambios para generar el PDF.';
  }
  $('certificate-help').textContent = help;
  $('settlement').hidden = !current.id || dirty;
}

function render(record = {}) {
  for (const url of evidenceUrls.splice(0)) URL.revokeObjectURL(url);
  current = record;
  $('delete-record').hidden = !record.id;
  dirty = false;
  $('identity').replaceChildren();
  $('numbers').replaceChildren();
  $('checks').replaceChildren();
  $('result').replaceChildren();
  status('');
  $('reference').textContent = [record.id ? '#' + record.id : 'Sin guardar', record.demo ? 'Caso ficticio' : ''].filter(Boolean).join(' · ');
  for (const [key, label, type] of identity) {
    const input = control($('identity'), key, label, type, record[key] ?? '', ['', ...causes]);
    input.required = key !== 'motivo';
  }
  Object.entries(fields).forEach(([key, label]) => control($('numbers'), key, label, 'number', record[key] ?? '0'));
  form.elements.detalle.value = record.detalle ?? '';
  for (const [i, [area, task]] of departments.entries()) {
    const row = record.checks?.[i] ?? {};
    const detail = document.createElement('details');
    detail.open = i === 0;
    const summary = document.createElement('summary');
    summary.textContent = area;
    const badge = document.createElement('span');
    badge.id = 'badge' + i;
    summary.append(badge);
    const description = document.createElement('p');
    description.textContent = task;
    const grid = document.createElement('div');
    grid.className = 'grid';
    control(grid, 'responsable' + i, 'Responsable', 'text', row.responsable ?? '');
    control(grid, 'fecha' + i, 'Fecha de revisión', 'date', row.fecha ?? '');
    control(grid, 'estado' + i, 'Estado', 'select', row.estado ?? 'Pendiente', statuses);
    control(grid, 'observacion' + i, 'Observación', 'text', row.observacion ?? '');
    const uploader = control(grid, 'upload' + i, 'Evidencias PDF, PNG o JPEG', 'file');
    uploader.accept = '.pdf,.png,.jpg,.jpeg';
    uploader.multiple = true;
    const files = document.createElement('ul');
    files.className = 'file-list';
    for (const file of row.files ?? []) {
      const item = document.createElement('li');
      const url = URL.createObjectURL(file.blob);
      evidenceUrls.push(url);
      item.append(link(file.name, url), ' · ', link('Descargar', url, file.name));
      files.append(item);
    }
    detail.append(summary, description, grid, files);
    if (record.demo) {
      const example = examples[i];
      detail.append(link('Descargar evidencia de ejemplo', base + '/caso-ficticio/' + example, example));
    }
    $('checks').append(detail);
  }
  updateStatus();
  showRecords();
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').className = error ? 'error' : 'muted';
}

async function readEvidence(file) {
  const types = {
    pdf: ['application/pdf', [37, 80, 68, 70, 45]],
    png: ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
    jpg: ['image/jpeg', [255, 216, 255]],
  };
  const extension = file.name.split('.').pop().toLowerCase().replace(/^jpeg$/, 'jpg');
  const format = Object.hasOwn(types, extension) && types[extension];
  const error = 'Adjunte un PDF, PNG o JPEG válido de hasta 10 MB.';
  if (!format || file.size > 10_000_000) throw new Error(error);
  const [type, signature] = format;
  const header = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  if (!signature.every((byte, i) => header[i] === byte)) throw new Error(error);
  return { name: file.name, blob: file.slice(0, file.size, type) };
}

function values() {
  const value = key => form.elements[key].value.trim();
  const keys = [...identity.map(([key]) => key), ...Object.keys(fields), 'detalle'];
  const data = Object.fromEntries(keys.map(key => [key, value(key)]));
  data.demo = Boolean(current.demo);
  data.checks = departments.map((_, i) => Object.fromEntries(
    ['responsable', 'fecha', 'estado', 'observacion'].map(key => [key, value(key + i)]),
  ));
  return data;
}

function setBusy(value) {
  busy = value;
  form.inert = value;
}

$('delete-record').onclick = async () => {
  if (!current.id || busy) return;
  const { id, trabajador } = current;
  if (!confirm('¿Eliminar definitivamente el expediente #' + id + ' de ' + trabajador + ' y todas sus evidencias?')) return;
  setBusy(true);
  try {
    await deleteRecord(db, current);
    records = records.filter(row => row.id !== id);
    render();
    status('Expediente #' + id + ' eliminado.');
    $('new').focus();
  } catch (error) {
    status(error.message, true);
  } finally {
    setBusy(false);
  }
};

async function showPdf(certificate) {
  const record = current;
  const viewer = window.open('', '_blank');
  if (!viewer) {
    status('Permite las ventanas emergentes para abrir el PDF.', true);
    return;
  }
  viewer.opener = null;
  try {
    const { createPdf } = await import('./documentos.js');
    createPdf(record, certificate).open({}, viewer);
  } catch {
    viewer.close();
    status('No se pudo generar el PDF.', true);
  }
}

$('search').oninput = showRecords;
$('certificate').onclick = () => showPdf(true);
$('settlement').onclick = () => showPdf(false);
form.oninput = () => {
  dirty = true;
  updateStatus();
  $('result').replaceChildren();
  status('Cambios sin guardar.');
};
$('new').onclick = () => { if (canLeave()) render(); };
$('demo').onclick = () => {
  if (!canLeave()) return;
  render(demo);
  dirty = true;
  status('Datos cargados. Las evidencias de ejemplo están disponibles en cada departamento.');
};
$('calculate').onclick = () => {
  try {
    const data = calculate(values());
    const table = document.createElement('table');
    for (const row of [...data.items, ['Total haberes', data.gross], ['Total deducciones', data.deductions], ['Neto a pagar', data.net]]) {
      const tr = table.insertRow();
      for (const text of row) tr.insertCell().textContent = text;
    }
    $('result').replaceChildren(table);
    status('Cálculo actualizado.');
  } catch (error) { status(error.message, true); }
};
form.onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  try {
    const data = values();
    calculate(data);
    await Promise.all(data.checks.map(async (row, i) => {
      const selected = Array.from(form.elements['upload' + i].files);
      row.files = [...(current.checks?.[i]?.files ?? []), ...await Promise.all(selected.map(readEvidence))];
    }));
    validate(data);
    const saved = await saveRecord(db, data, current);
    records = [saved, ...records.filter(row => row.id !== saved.id)].sort((a, b) => b.id - a.id);
    render(saved);
    status('Expediente guardado.');
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
};

openRecords(base).then(async storage => {
  records = await listRecords(storage);
  db = storage;
  render(records[0]);
  form.inert = false;
}).catch(error => status(error.message, true));
