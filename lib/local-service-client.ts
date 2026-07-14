import { createId } from "@/lib/local-db";
import {
  createLocalUser,
  getLocalProfile,
  getLocalSession,
  toLocalUser,
  updateLocalPasswordForUser,
  type LocalUser,
} from "@/lib/local-auth";
import { blobToBuffer, ensureBucket, readStoredFile, removeStoredFiles, writeStoredFile } from "@/lib/local-storage";
import { executeLocalTableQuery, type LocalFilter, type LocalOrder, type LocalTableQuery } from "@/lib/local-table";
import type { UserRole } from "@/lib/supabase";

type BuilderState = {
  table: string;
  action: LocalTableQuery["action"];
  select?: string;
  payload?: unknown;
  filters: LocalFilter[];
  order?: LocalOrder | null;
  limit?: number | null;
  single?: boolean;
  maybeSingle?: boolean;
};

class LocalServerQueryBuilder {
  private state: BuilderState;

  constructor(table: string) {
    this.state = { table, action: "select", filters: [] };
  }

  select(select = "*") {
    this.state.select = select;
    return this;
  }

  insert(payload: unknown) {
    this.state.action = "insert";
    this.state.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.action = "update";
    this.state.payload = payload;
    return this;
  }

  upsert(payload: unknown) {
    this.state.action = "upsert";
    this.state.payload = payload;
    return this;
  }

  delete() {
    this.state.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ column, op: "eq", value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.state.filters.push({ column, op: "in", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.state.order = { column, ascending: options?.ascending };
    return this;
  }

  limit(value: number) {
    this.state.limit = value;
    return this;
  }

  single() {
    this.state.single = true;
    return this.execute();
  }

  maybeSingle() {
    this.state.maybeSingle = true;
    return this.execute();
  }

  then<TResult1 = Awaited<ReturnType<typeof this.execute>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<typeof this.execute>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    try {
      return await executeLocalTableQuery(this.state, null, true);
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Databasefout." } };
    }
  }
}

class LocalServerStorageBucket {
  constructor(private bucket: string) {}

  async download(filePath: string) {
    try {
      const buffer = await readStoredFile(this.bucket, filePath);
      return { data: new Blob([buffer]), error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Bestand ophalen mislukt." } };
    }
  }

  async upload(filePath: string, body: Blob | File | Buffer | Uint8Array | string) {
    try {
      await writeStoredFile(this.bucket, filePath, await blobToBuffer(body));
      return { data: { path: filePath }, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Bestand opslaan mislukt." } };
    }
  }

  async remove(paths: string[]) {
    try {
      await removeStoredFiles(this.bucket, paths);
      return { data: paths.map((name) => ({ name })), error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Bestand verwijderen mislukt." } };
    }
  }

  async createSignedUploadUrl(filePath: string) {
    return {
      data: {
        path: filePath,
        signedUrl: `/api/local/storage/upload`,
        token: createId(),
      },
      error: null,
    };
  }
}

export function createLocalServiceClient() {
  return {
    auth: {
      async getUser(token: string) {
        const session = await getLocalSession(token);
        return session
          ? { data: { user: session.user }, error: null }
          : { data: { user: null }, error: { message: "Ongeldige sessie." } };
      },
      admin: {
        async getUserById(userId: string) {
          const profile = await getLocalProfile(userId);
          return profile
            ? { data: { user: toLocalUser(profile) }, error: null }
            : { data: { user: null }, error: { message: "Gebruiker niet gevonden." } };
        },
        async updateUserById(userId: string, payload: { password?: string; user_metadata?: Record<string, unknown> }) {
          if (payload.password) {
            const mustSetPassword = typeof payload.user_metadata?.must_set_password === "boolean"
              ? payload.user_metadata.must_set_password
              : false;
            const passwordResult = await updateLocalPasswordForUser(userId, payload.password, mustSetPassword);
            if (passwordResult.error) return { data: { user: null }, error: { message: passwordResult.error } };
          }

          const metadata = payload.user_metadata ?? {};
          const updatePayload: Record<string, unknown> = {};
          if (typeof metadata.full_name === "string") updatePayload.full_name = metadata.full_name;
          if (typeof metadata.job_title === "string") updatePayload.job_title = metadata.job_title;
          if (typeof metadata.workdays === "string") updatePayload.workdays = metadata.workdays;
          if (typeof metadata.mobile_phone === "string") updatePayload.mobile_phone = metadata.mobile_phone;
          if (
            metadata.employee_relation_id === null ||
            (typeof metadata.employee_relation_id === "number" && Number.isSafeInteger(metadata.employee_relation_id))
          ) {
            updatePayload.employee_relation_id = metadata.employee_relation_id;
          }
          if (typeof metadata.role === "string") updatePayload.role = metadata.role as UserRole;
          if (typeof metadata.must_set_password === "boolean") updatePayload.must_set_password = metadata.must_set_password;

          if (Object.keys(updatePayload).length) {
            await new LocalServerQueryBuilder("profiles").update(updatePayload).eq("id", userId).single();
          }

          const profile = await getLocalProfile(userId);
          return profile
            ? { data: { user: toLocalUser(profile) }, error: null }
            : { data: { user: null }, error: { message: "Gebruiker niet gevonden." } };
        },
        async deleteUser(userId: string) {
          return new LocalServerQueryBuilder("profiles").delete().eq("id", userId).maybeSingle();
        },
        async inviteUserByEmail(email: string, options?: { data?: Record<string, unknown> }) {
          const data = options?.data ?? {};
          const result = await createLocalUser({
            email,
            fullName: typeof data.full_name === "string" ? data.full_name : null,
            jobTitle: typeof data.job_title === "string" ? data.job_title : null,
            workdays: typeof data.workdays === "string" ? data.workdays : null,
            mobilePhone: typeof data.mobile_phone === "string" ? data.mobile_phone : null,
            role: typeof data.role === "string" ? data.role as UserRole : "sales",
            mustSetPassword: true,
          });

          return { data: { user: result.user as LocalUser, temporaryPassword: result.temporaryPassword }, error: null };
        },
      },
    },
    from(table: string) {
      return new LocalServerQueryBuilder(table);
    },
    storage: {
      from(bucket: string) {
        return new LocalServerStorageBucket(bucket);
      },
      async getBucket(bucket: string) {
        await ensureBucket(bucket);
        return { data: { id: bucket, name: bucket }, error: null };
      },
      async createBucket(bucket: string) {
        await ensureBucket(bucket);
        return { data: { id: bucket, name: bucket }, error: null };
      },
    },
  };
}
