import {
  IMPLEMENTATION_FILE_BUCKET,
  IMPLEMENTATION_FILE_MAX_SIZE,
  implementationFileCategoryDefinition,
  implementationFileExtension,
  implementationFileMimeType,
  isImplementationFileCategory,
  isImplementationFileStatus,
  type ImplementationCustomerFile,
  type ImplementationFileCategory,
  type ImplementationFileStatus,
} from "@/lib/implementation-files";
import { createId, query, withTransaction } from "@/lib/local-db";
import {
  blobToBuffer,
  readStoredFile,
  removeStoredFiles,
  writeStoredFile,
} from "@/lib/local-storage";

type ImplementationFileRow = {
  id: string;
  implementation_id: string;
  category: ImplementationFileCategory;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  status: ImplementationFileStatus;
  uploaded_at: string | Date;
  checked_at: string | Date | null;
};

function isoValue(value: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toImplementationFile(row: ImplementationFileRow): ImplementationCustomerFile {
  return {
    id: row.id,
    implementationId: row.implementation_id,
    category: row.category,
    fileName: row.file_name,
    mimeType: row.mime_type || implementationFileMimeType(row.file_name),
    fileSize: Number(row.file_size ?? 0),
    status: row.status,
    uploadedAt: isoValue(row.uploaded_at) ?? new Date().toISOString(),
    checkedAt: isoValue(row.checked_at),
  };
}

function safeStorageName(fileName: string) {
  const normalized = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return normalized || "bestand";
}

function validateFile(category: ImplementationFileCategory, file: File) {
  if (!file.name.trim()) return "De bestandsnaam ontbreekt.";
  if (file.size <= 0) return "Het bestand is leeg.";
  if (file.size > IMPLEMENTATION_FILE_MAX_SIZE) return "Het bestand is groter dan 25 MB.";

  const extension = implementationFileExtension(file.name);
  const definition = implementationFileCategoryDefinition(category);
  if (!definition.extensions.includes(extension)) {
    return `Dit bestandstype is niet toegestaan bij ${definition.label}.`;
  }
  return "";
}

export async function listImplementationCustomerFiles(implementationId: string) {
  const { rows } = await query<ImplementationFileRow>(
    `select id, implementation_id, category, file_name, storage_path, mime_type,
            file_size, status, uploaded_at, checked_at
     from public.implementation_customer_files
     where implementation_id = $1
     order by category asc, uploaded_at desc`,
    [implementationId],
  );
  return rows.map(toImplementationFile);
}

export async function storeImplementationCustomerFile(
  implementationId: string,
  categoryValue: unknown,
  file: File,
) {
  if (!isImplementationFileCategory(categoryValue)) {
    return { ok: false as const, status: 400, error: "Kies een geldige bestandssoort." };
  }

  const validationError = validateFile(categoryValue, file);
  if (validationError) return { ok: false as const, status: 400, error: validationError };

  const { rows: countRows } = await query<{ count: number }>(
    `select count(*)::int as count
     from public.implementation_customer_files
     where implementation_id = $1 and category = $2`,
    [implementationId, categoryValue],
  );
  if (Number(countRows[0]?.count ?? 0) >= 50) {
    return { ok: false as const, status: 400, error: "Er staan al 50 bestanden in deze sectie." };
  }

  const id = createId();
  const fileName = file.name.trim().slice(0, 255);
  const storagePath = `${implementationId}/${categoryValue}/${id}-${safeStorageName(fileName)}`;
  const mimeType = implementationFileMimeType(fileName);

  await writeStoredFile(IMPLEMENTATION_FILE_BUCKET, storagePath, await blobToBuffer(file));

  try {
    const row = await withTransaction(async (client) => {
      const { rows } = await client.query<ImplementationFileRow>(
        `insert into public.implementation_customer_files
           (id, implementation_id, category, file_name, storage_path, mime_type, file_size)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, implementation_id, category, file_name, storage_path, mime_type,
                   file_size, status, uploaded_at, checked_at`,
        [id, implementationId, categoryValue, fileName, storagePath, mimeType, file.size],
      );
      await client.query(
        `insert into public.implementation_customer_file_events
           (implementation_id, file_id, category, file_name, event_type, actor_type)
         values ($1, $2, $3, $4, 'uploaded', 'customer')`,
        [implementationId, id, categoryValue, fileName],
      );
      return rows[0];
    });
    return { ok: true as const, file: toImplementationFile(row) };
  } catch (error) {
    await removeStoredFiles(IMPLEMENTATION_FILE_BUCKET, [storagePath]).catch(() => undefined);
    throw error;
  }
}

export async function readImplementationCustomerFile(
  implementationId: string,
  fileId: string,
) {
  const { rows } = await query<ImplementationFileRow>(
    `select id, implementation_id, category, file_name, storage_path, mime_type,
            file_size, status, uploaded_at, checked_at
     from public.implementation_customer_files
     where implementation_id = $1 and id = $2
     limit 1`,
    [implementationId, fileId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    file: toImplementationFile(row),
    data: await readStoredFile(IMPLEMENTATION_FILE_BUCKET, row.storage_path),
  };
}

export async function deleteImplementationCustomerFile(
  implementationId: string,
  fileId: string,
) {
  const { rows } = await query<ImplementationFileRow>(
    `select id, implementation_id, category, file_name, storage_path, mime_type,
            file_size, status, uploaded_at, checked_at
     from public.implementation_customer_files
     where implementation_id = $1 and id = $2
     limit 1`,
    [implementationId, fileId],
  );
  const row = rows[0];
  if (!row) return { ok: false as const, status: 404, error: "Bestand niet gevonden." };

  await withTransaction(async (client) => {
    await client.query(
      `insert into public.implementation_customer_file_events
         (implementation_id, file_id, category, file_name, event_type, actor_type)
       values ($1, $2, $3, $4, 'deleted', 'customer')`,
      [implementationId, row.id, row.category, row.file_name],
    );
    await client.query(
      "delete from public.implementation_customer_files where implementation_id = $1 and id = $2",
      [implementationId, fileId],
    );
  });
  await removeStoredFiles(IMPLEMENTATION_FILE_BUCKET, [row.storage_path]).catch((error) => {
    console.error("Klantbestand kon niet fysiek worden verwijderd.", error);
  });
  return { ok: true as const };
}

export async function updateImplementationCustomerFileStatus(
  implementationId: string,
  fileId: string,
  statusValue: unknown,
  actorId: string,
) {
  if (!isImplementationFileStatus(statusValue)) {
    return { ok: false as const, status: 400, error: "Kies een geldige status." };
  }

  const row = await withTransaction(async (client) => {
    const { rows } = await client.query<ImplementationFileRow>(
      `update public.implementation_customer_files
       set status = $3,
           checked_at = case when $3::text = 'checked' then now() else null end,
           checked_by = case when $3::text = 'checked' then $4 else null end,
           updated_at = now()
       where implementation_id = $1 and id = $2
       returning id, implementation_id, category, file_name, storage_path, mime_type,
                 file_size, status, uploaded_at, checked_at`,
      [implementationId, fileId, statusValue, actorId],
    );
    const updated = rows[0];
    if (!updated) return null;
    await client.query(
      `insert into public.implementation_customer_file_events
         (implementation_id, file_id, category, file_name, event_type, actor_type, actor_id)
       values ($1, $2, $3, $4, $5, 'user', $6)`,
      [
        implementationId,
        fileId,
        updated.category,
        updated.file_name,
        statusValue === "checked" ? "checked" : "reopened",
        actorId,
      ],
    );
    return updated;
  });
  if (!row) return { ok: false as const, status: 404, error: "Bestand niet gevonden." };
  return { ok: true as const, file: toImplementationFile(row) };
}
