type RpcResponse<T> = { data: T | null; error: Error | null };

type MockState = {
  lastUpdate: Record<string, unknown> | null;
  updateCalls: number;
  insertCalls: number;
  insertedLogs: Record<string, unknown>[];
};

const buildMockSupabase = (overrides?: {
  credential?: Record<string, unknown> | null;
  encryptPrefix?: string;
  rpcError?: Error | null;
}) => {
  const state: MockState = {
    lastUpdate: null,
    updateCalls: 0,
    insertCalls: 0,
    insertedLogs: [],
  };

  const credential = overrides?.credential ?? {
    id: "cred-1",
    account_id: "acc-1",
    api_name: "CAL_COM",
    refresh_token: "refresh-token",
    client_id: "client-id",
    client_secret: "client-secret",
  };
  const encryptPrefix = overrides?.encryptPrefix ?? "enc:";
  const rpcError = overrides?.rpcError ?? null;

  const rpcInner = async (name: string, params: Record<string, unknown>): Promise<RpcResponse<unknown>> => {
    if (rpcError) return { data: null, error: rpcError };
    if (name === "get_credential_by_id") {
      return { data: credential, error: null };
    }
    if (name === "encrypt_token") {
      const plain = params?.plain_text ? String(params.plain_text) : "";
      return { data: `${encryptPrefix}${plain}`, error: null };
    }
    return { data: null, error: null };
  };

  const rpc = (name: string, params: Record<string, unknown>) => {
    if (name === "get_credential_by_id") {
      return { maybeSingle: async () => rpcInner(name, params) };
    }
    return rpcInner(name, params);
  };

  const schema = (_schema: string) => ({
    from: (_table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, _val: unknown) => {
          state.updateCalls += 1;
          state.lastUpdate = values;
          return { error: null };
        },
      }),
      insert: async (values: Record<string, unknown>) => {
        state.insertCalls += 1;
        state.insertedLogs.push(values);
        return { error: null };
      },
    }),
  });

  const createClient = () => ({
    rpc,
    schema,
  });

  return { createClient, state };
};

const setMockCreateClient = (createClient: unknown) => {
  (globalThis as { __SUPABASE_CREATE_CLIENT__?: unknown }).__SUPABASE_CREATE_CLIENT__ = createClient;
};

const clearMockCreateClient = () => {
  delete (globalThis as { __SUPABASE_CREATE_CLIENT__?: unknown }).__SUPABASE_CREATE_CLIENT__;
};

export { buildMockSupabase, setMockCreateClient, clearMockCreateClient };
