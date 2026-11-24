const storeName = 'expedientes';

export function openRecords(base) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('paz-y-salvo' + base, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento de este navegador.'));
    request.onblocked = () => reject(new Error('Cierra las otras pestañas de la aplicación e inténtalo de nuevo.'));
  });
}

function transact(db, mode, operation, expected) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    let conflict = false;
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(new Error(conflict
      ? 'El expediente cambió en otra pestaña. Recarga la página antes de continuar.'
      : 'No se pudo guardar el cambio. Revisa el espacio disponible y los permisos del navegador.'));
    const write = () => { request = operation(store); };
    if (!expected?.id) {
      write();
      return;
    }
    const lookup = store.get(expected.id);
    lookup.onsuccess = () => {
      if (lookup.result?.revision !== expected.revision) {
        conflict = true;
        transaction.abort();
        return;
      }
      write();
    };
  });
}

export async function listRecords(db) {
  return (await transact(db, 'readonly', store => store.getAll())).reverse();
}

export async function saveRecord(db, record, previous) {
  const saved = {
    ...record,
    ...(previous.id ? { id: previous.id } : {}),
    revision: (previous.revision ?? 0) + 1,
  };
  const id = await transact(db, 'readwrite', store => store.put(saved), previous);
  return { ...saved, id };
}

export function deleteRecord(db, record) {
  return transact(db, 'readwrite', store => store.delete(record.id), record);
}
