import { AppSchema } from "../library/AppSchema";
import { WASQLitePowerSyncDatabaseOpenFactory } from "@powersync/web";
import { createPowerSyncPlugin } from "@powersync/vue";

export const powerSync = new WASQLitePowerSyncDatabaseOpenFactory({
  dbFilename: "vue-todo.db",
  schema: AppSchema,
}).getInstance();

export const powerSyncPlugin = createPowerSyncPlugin({ database: powerSync });