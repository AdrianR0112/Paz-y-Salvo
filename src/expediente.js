import Decimal from 'decimal.js-light';

Decimal.set({ precision: 40 });

export const fields = {
  sueldo: 'Última remuneración mensual',
  dias: 'Días de sueldo pendientes (0–30)',
  vac_generadas: 'Días de vacaciones generados',
  vac_gozadas: 'Días gozados o ya pagados',
  vac_base: 'Remuneración computable del período anual de vacaciones',
  decimo3: 'Remuneraciones computables pendientes de décimo tercero',
  sbu: 'SBU aplicable al décimo cuarto',
  meses14: 'Meses equivalentes pendientes de décimo cuarto (0–12)',
  anios185: 'Años computables para bonificación art. 185',
  otros: 'Otros haberes verificados',
  deducciones: 'Deducciones verificadas',
};

export const causes = ['Acuerdo de las partes', 'Desahucio del trabajador', 'Despido intempestivo', 'Otra causa'];
export const departments = [
  ['Talento Humano', 'Verificar contrato, causal y saldo de vacaciones'],
  ['Operaciones / Activos', 'Recibir equipos, herramientas y bienes asignados'],
  ['Tecnología', 'Recibir credenciales físicas y confirmar baja de accesos'],
  ['Contabilidad', 'Conciliar nómina, anticipos y rubros de liquidación'],
];
export const statuses = ['Pendiente', 'Observado', 'Aprobado'];
export const identity = [
  ['empresa', 'Razón social'], ['ruc', 'RUC'], ['representante', 'Representante del empleador'],
  ['trabajador', 'Trabajador/a'], ['cedula', 'Identificación'], ['cargo', 'Cargo'],
  ['ciudad', 'Ciudad'], ['ingreso', 'Fecha de ingreso', 'date'], ['salida', 'Último día laboral', 'date'],
  ['causa', 'Causa de terminación', 'select'], ['motivo', 'Detalle de causa (si aplica)'],
];

function date(value) {
  const parsed = new Date(value + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Ingrese una fecha válida.');
  }
  return parsed;
}

function employmentDates(record) {
  const start = date(record.ingreso);
  const end = date(record.salida);
  if (end < start) throw new Error('La fecha de salida debe ser igual o posterior a la de ingreso.');
  return [start, end];
}

export function validate(record) {
  if (identity.some(([key]) => key !== 'motivo' && !record[key]) || !causes.includes(record.causa)) {
    throw new Error('Complete los datos del empleador, trabajador y terminación.');
  }
  employmentDates(record);
  for (const check of record.checks) {
    if (check.fecha) date(check.fecha);
    if (check.estado === 'Aprobado' && !(check.responsable && check.fecha && check.files.length)) {
      throw new Error('Cada aprobación requiere responsable, fecha y evidencia.');
    }
  }
  if (['otros', 'deducciones'].some(key => Number(record[key])) && !record.detalle) {
    throw new Error('Detalle los otros haberes y las deducciones.');
  }
  if (record.causa === 'Otra causa' && !record.motivo) {
    throw new Error('Especifique la otra causa.');
  }
}

function money(value) {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function dollars(value) {
  const [amount, cents] = value.toFixed(2).split('.');
  return 'USD ' + amount.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + cents;
}

export function calculate(record) {
  const amounts = Object.fromEntries(Object.entries(fields).map(([key, label]) => {
    if (!/^\d{1,8}(?:\.\d{1,6})?$/.test(record[key])) {
      throw new Error('Ingrese un valor válido en ' + label + '.');
    }
    return [key, new Decimal(record[key])];
  }));
  const pending = amounts.vac_generadas.minus(amounts.vac_gozadas);
  if (pending.lt(0) || amounts.dias.gt(30) || amounts.meses14.gt(12)) {
    throw new Error('Revise los límites de sueldo, vacaciones y décimo cuarto.');
  }
  const bonus = causes.slice(0, 3).includes(record.causa) ? amounts.sueldo.times(amounts.anios185).div(4) : new Decimal(0);
  let severance = new Decimal(0);
  if (record.causa === causes[2]) {
    const [start, end] = employmentDates(record);
    end.setUTCDate(end.getUTCDate() + 1);
    const month = end.getUTCMonth() - start.getUTCMonth();
    const partialYear = month > 0 || (month === 0 && end.getUTCDate() > start.getUTCDate());
    const years = end.getUTCFullYear() - start.getUTCFullYear() + Number(partialYear);
    severance = amounts.sueldo.times(Math.min(25, Math.max(3, years)));
  }
  const rows = [
    ['Sueldo pendiente', amounts.sueldo.times(amounts.dias).div(30)],
    [`Vacaciones pendientes (${pending} días)`, amounts.vac_base.times(pending).div(360)],
    ['Décimo tercero pendiente', amounts.decimo3.div(12)],
    ['Décimo cuarto pendiente', amounts.sbu.times(amounts.meses14).div(12)],
    ['Bonificación por desahucio (art. 185)', bonus],
    ['Indemnización por despido intempestivo (art. 188)', severance],
    ['Otros haberes', amounts.otros],
  ].map(([label, value]) => [label, money(value)]);
  const gross = rows.reduce((sum, [, value]) => sum.plus(value), new Decimal(0));
  const deductions = money(amounts.deducciones);
  return {
    items: rows.map(([label, value]) => [label, dollars(value)]),
    gross: dollars(gross),
    deductions: dollars(deductions),
    net: dollars(gross.minus(deductions)),
  };
}
