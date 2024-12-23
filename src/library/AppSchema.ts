import { column, Schema, TableV2 } from "@powersync/web";

export const TODOS_TABLE = "todos";

const todos = new TableV2({
  created_at: column.text,
  description: column.text,
  completed: column.integer,
  isNew: column.real,
});

export const AppSchema = new Schema({
  todos,
});

export type Database = (typeof AppSchema)["types"];
export type TodoRecord = Database["todos"];
