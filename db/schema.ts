import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* Multiplayer rooms are intentionally compact JSON snapshots. A room lasts long
   enough for a play-test and survives Worker restarts and page reloads. */
export const multiplayerRooms = sqliteTable("multiplayer_rooms", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
