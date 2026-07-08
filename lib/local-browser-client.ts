import { LOCAL_AUTH_TOKEN_KEY } from "@/lib/local-auth-shared";
import type { LocalFilter, LocalOrder, LocalTableQuery } from "@/lib/local-table";

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

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LOCAL_AUTH_TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
  }
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });
}

class LocalBrowserQueryBuilder {
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
      const response = await apiFetch("/api/local/data", {
        method: "POST",
        body: JSON.stringify(this.state),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return { data: null, error: { message: payload?.error || "Databaseverzoek mislukt." } };
      }
      return { data: payload?.data ?? null, error: payload?.error ?? null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Databaseverzoek mislukt." } };
    }
  }
}

class LocalBrowserStorageBucket {
  constructor(private bucket: string) {}

  async download(filePath: string) {
    try {
      const url = new URL("/api/local/storage/download", window.location.origin);
      url.searchParams.set("bucket", this.bucket);
      url.searchParams.set("path", filePath);
      const response = await apiFetch(url.toString());
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        return { data: null, error: { message: payload?.error || "Bestand downloaden mislukt." } };
      }
      return { data: await response.blob(), error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Bestand downloaden mislukt." } };
    }
  }

  async upload(filePath: string, file: Blob | File) {
    try {
      const formData = new FormData();
      formData.set("bucket", this.bucket);
      formData.set("path", filePath);
      formData.set("file", file);
      const response = await apiFetch("/api/local/storage/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      return response.ok
        ? { data: payload?.data ?? { path: filePath }, error: null }
        : { data: null, error: { message: payload?.error || "Bestand uploaden mislukt." } };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Bestand uploaden mislukt." } };
    }
  }

  async uploadToSignedUrl(filePath: string, _token: string, file: Blob | File) {
    return this.upload(filePath, file);
  }

  async remove(paths: string[]) {
    try {
      const response = await apiFetch("/api/local/storage/remove", {
        method: "POST",
        body: JSON.stringify({ bucket: this.bucket, paths }),
      });
      const payload = await response.json().catch(() => null);
      return response.ok
        ? { data: payload?.data ?? paths.map((name) => ({ name })), error: null }
        : { data: null, error: { message: payload?.error || "Bestand verwijderen mislukt." } };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Bestand verwijderen mislukt." } };
    }
  }
}

let localClient: ReturnType<typeof createLocalBrowserClient> | null = null;

export function getLocalBrowserClient() {
  if (!localClient) localClient = createLocalBrowserClient();
  return localClient;
}

function createLocalBrowserClient() {
  return {
    auth: {
      async signInWithPassword(input: { email: string; password: string }) {
        const response = await fetch("/api/local/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          return { data: null, error: { message: payload?.error || "Inloggen mislukt." } };
        }
        const token = payload?.data?.session?.access_token ?? null;
        if (token) {
          setStoredToken(token);
          window.dispatchEvent(new CustomEvent("smarttrade-auth-change", { detail: payload?.data?.session ?? null }));
        }
        return { data: payload?.data ?? null, error: null };
      },
      async verifyTwoFactor(input: { challengeToken: string; code: string }) {
        const response = await fetch("/api/local/auth/2fa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          return { data: null, error: { message: payload?.error || "2FA-controle mislukt." } };
        }
        const token = payload?.data?.session?.access_token ?? null;
        if (token) {
          setStoredToken(token);
          window.dispatchEvent(new CustomEvent("smarttrade-auth-change", { detail: payload?.data?.session ?? null }));
        }
        return { data: payload?.data ?? null, error: null };
      },
      async getSession() {
        const response = await apiFetch("/api/local/auth/session");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setStoredToken(null);
          return { data: { session: null }, error: { message: payload?.error || "Sessie ophalen mislukt." } };
        }
        const token = payload?.data?.session?.access_token ?? null;
        if (token) setStoredToken(token);
        return { data: { session: payload?.data?.session ?? null }, error: null };
      },
      async refreshSession() {
        return this.getSession();
      },
      async signOut() {
        await apiFetch("/api/local/auth/logout", { method: "POST" }).catch(() => null);
        setStoredToken(null);
        window.dispatchEvent(new CustomEvent("smarttrade-auth-change", { detail: null }));
        return { error: null };
      },
      async updateUser(input: { password?: string }) {
        const response = await apiFetch("/api/local/auth/update-password", {
          method: "POST",
          body: JSON.stringify(input),
        });
        const payload = await response.json().catch(() => null);
        return response.ok
          ? { data: payload?.data ?? null, error: null }
          : { data: null, error: { message: payload?.error || "Wachtwoord wijzigen mislukt." } };
      },
      async resetPasswordForEmail() {
        return { data: null, error: { message: "Wachtwoord resetten loopt nu via de admin pagina." } };
      },
      onAuthStateChange(callback: (event: string, session: unknown) => void) {
        function handler(event: Event) {
          callback((event as CustomEvent).detail ? "SIGNED_IN" : "SIGNED_OUT", (event as CustomEvent).detail ?? null);
        }
        window.addEventListener("smarttrade-auth-change", handler);
        return {
          data: {
            subscription: {
              unsubscribe() {
                window.removeEventListener("smarttrade-auth-change", handler);
              },
            },
          },
        };
      },
    },
    from(table: string) {
      return new LocalBrowserQueryBuilder(table);
    },
    storage: {
      from(bucket: string) {
        return new LocalBrowserStorageBucket(bucket);
      },
    },
  };
}
