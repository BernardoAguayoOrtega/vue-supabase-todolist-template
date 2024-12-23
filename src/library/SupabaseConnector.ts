import {
    AbstractPowerSyncDatabase,
    BaseObserver,
    CrudEntry,
    PowerSyncBackendConnector,
    UpdateType,
  } from "@powersync/web";
  
  import { Session, SupabaseClient, createClient } from "@supabase/supabase-js";
  
  export type SupabaseConfig = {
    supabaseUrl: string;
    supabaseAnonKey: string;
    powersyncUrl: string;
  };
  
  /// Postgres Response codes that we cannot recover from by retrying.
  const FATAL_RESPONSE_CODES = [
    // Class 22 — Data Exception
    // Examples include data type mismatch.
    /^22...$/,
    // Class 23 — Integrity Constraint Violation.
    // Examples include NOT NULL, FOREIGN KEY, and UNIQUE violations.
    /^23...$/,
    // INSUFFICIENT PRIVILEGE - typically a row-level security violation
    /^42501$/,
  ];
  
  export type SupabaseConnectorListener = {
    initialized: () => void;
    sessionStarted: (session: Session) => void;
  };
  
  export class SupabaseConnector
    extends BaseObserver<SupabaseConnectorListener>
    implements PowerSyncBackendConnector
  {
    readonly client: SupabaseClient;
    readonly config: SupabaseConfig;
    ready: boolean = false;
    currentSession: Session | null = null;
  
    constructor() {
      super();
      this.config = {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        powersyncUrl: import.meta.env.VITE_POWERSYNC_URL,
        supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      };
  
      this.client = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
        auth: {
          persistSession: true,
        },
      });
    }
  
    async init(): Promise<void> {
      if (this.ready) {
        return;
      }
  
      const sessionResponse = await this.client.auth.getSession();
      this.updateSession(sessionResponse.data.session);
  
      this.ready = true;
      this.iterateListeners((cb) => cb.initialized?.());
    }
  
    async login(username: string, password: string): Promise<void> {
      const {
        data: { session },
        error,
      } = await this.client.auth.signInWithPassword({
        email: username,
        password,
      });
  
      if (error) {
        throw error;
      }
  
      this.updateSession(session);
    }
  
    async fetchCredentials(): Promise<{
      endpoint: string;
      token: string;
      expiresAt?: Date;
    }> {
      const {
        data: { session },
        error,
      } = await this.client.auth.getSession();
  
      if (!session || error) {
        throw new Error(`Could not fetch Supabase credentials: ${error}`);
      }
  
      console.debug("session expires at", session.expires_at);
  
      return {
        endpoint: this.config.powersyncUrl,
        token: session.access_token ?? "",
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
      };
    }
  
    async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
      const transaction = await database.getNextCrudTransaction();
  
      if (!transaction) {
        return;
      }
  
      let lastOp: CrudEntry | null = null;
      try {
        for (const op of transaction.crud) {
          lastOp = op;
          const table = this.client.from(op.table);
          let result;
  
          switch (op.op) {
            case UpdateType.PUT:
              result = await table.upsert({ ...op.opData, id: op.id });
              break;
            case UpdateType.PATCH:
              result = await table.update(op.opData).eq("id", op.id);
              break;
            case UpdateType.DELETE:
              result = await table.delete().eq("id", op.id);
              break;
            default:
              throw new Error(`Unsupported operation type: ${op.op}`);
          }
  
          if (result.error) {
            console.error(result.error);
            throw new Error(`Could not update Supabase. Received error: ${result.error.message}`);
          }
        }
  
        await transaction.complete();
      } catch (ex: any) {
        console.debug(ex);
        if (
          typeof ex.code === "string" &&
          FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
        ) {
          console.error(`Data upload error - discarding ${lastOp}`, ex);
          await transaction.complete();
        } else {
          throw ex;
        }
      }
    }
  
    private updateSession(session: Session | null): void {
      this.currentSession = session;
      if (!session) {
        return;
      }
      this.iterateListeners((cb) => cb.sessionStarted?.(session));
    }
  }