import { getSupabaseClient } from "./supabase";

type StoredPhoto = {
  id: string;
  blob: Blob;
  name: string;
};

const databaseName = "morada-photos-v1";
const storeName = "photos";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador não permite armazenar fotos."));
      return;
    }

    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento de fotos."));
  });
}

export async function savePhotos(files: File[], scope: string, condoId: string, recordId: string) {
  if (!files.length) return [];
  const client = getSupabaseClient();
  if (client && scope !== "demo") {
    const uploadedPaths: string[] = [];
    try {
      for (const file of files) {
        const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${condoId}/${recordId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await client.storage.from("condo-record-photos").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) throw new Error(error.message);
        uploadedPaths.push(path);
      }
      return uploadedPaths.map((path) => `${scope}:cloud:${path}`);
    } catch (error) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await client.storage.from("condo-record-photos").remove(uploadedPaths);
        if (cleanupError) throw new Error(`O upload das fotos falhou e a limpeza dos arquivos incompletos também falhou: ${cleanupError.message}`);
      }
      throw error;
    }
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const ids = files.map(() => `${scope}:${crypto.randomUUID()}`);
    files.forEach((file, index) => {
      store.add({ id: ids[index], blob: file, name: file.name } satisfies StoredPhoto);
    });
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível salvar as fotos."));
      transaction.onabort = () => reject(transaction.error ?? new Error("O salvamento das fotos foi cancelado."));
    });
    await completed;
    return ids;
  } finally {
    database.close();
  }
}

export async function loadPhotoUrls(ids: string[]) {
  if (!ids.length) return [];
  const client = getSupabaseClient();
  const cloudPhotos = ids.flatMap((id) => {
    const marker = id.indexOf(":cloud:");
    return marker === -1 ? [] : [{ id, path: id.slice(marker + ":cloud:".length) }];
  });
  const localIds = ids.filter((id) => !id.includes(":cloud:"));
  const cloudResults = cloudPhotos.length && client
    ? await client.storage.from("condo-record-photos").createSignedUrls(cloudPhotos.map((photo) => photo.path), 3600)
    : null;
  if (cloudResults?.error) throw new Error(cloudResults.error.message);
  const failedSignature = cloudResults?.data?.find((result) => result.error);
  if (failedSignature?.error) throw new Error(failedSignature.error);
  const signedUrls = (cloudResults?.data ?? []).flatMap((result, index) => {
    if (result.error || !result.signedUrl) return [];
    return [{ id: cloudPhotos[index].id, name: cloudPhotos[index].path.split("/").pop() ?? "Foto", url: result.signedUrl }];
  });
  if (!localIds.length) return signedUrls;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const results = await Promise.all(localIds.map((id) => new Promise<StoredPhoto | undefined>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as StoredPhoto | undefined);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível carregar uma foto."));
    })));
    return [
      ...signedUrls,
      ...results.flatMap((photo) => photo ? [{ id: photo.id, name: photo.name, url: URL.createObjectURL(photo.blob) }] : []),
    ];
  } finally {
    database.close();
  }
}
