import { AsyncLocalStorage } from "node:async_hooks";

export interface WideLoggerContext {
  ts: string;
  sev: "INFO" | "ERROR" | "WARN";
  msg: string;
  trace: {
    traceId?: string;
    spanId?: string;
    parentId?: string | undefined;
  };
  http: {
    method: string;
    route: string;
    path: string;
    status?: number;
    duration_ms?: number;
    user_agent?: string;
    ip?: string;
  };
  user?: {
    id: string;
    email: string;
  };
  ctx: Record<string, unknown>;
  host: {
    name: string;
    region?: string;
    ver?: string;
  };
  err?: {
    code?: string;
    message: string;
    stack: string;
  };
}

const storage = new AsyncLocalStorage<WideLoggerContext>();

export const wideLoggger = {
  init: (context: WideLoggerContext, callback: () => void) => {
    storage.run(context, callback);
  },
  get: (): WideLoggerContext | undefined => {
    return storage.getStore();
  },
  add: (section: keyof WideLoggerContext, data: Record<string, unknown>) => {
    const store = storage.getStore();

    if (store) {
      if (
        section === "http" ||
        section === "ctx" ||
        section === "err" ||
        section === "user" ||
        section === "trace"
      ) {
        (store[section] as Record<string, unknown>) = {
          ...(store[section] as Record<string, unknown>),
          ...data,
        };
      } else {
        (store[section] as Record<string, unknown>)[section] = data;
      }
    }
  },
  addCtx: (key: string, value: unknown) => {
    const store = storage.getStore();
    if (store) {
      store.ctx[key] = value;
    }
  },
};
