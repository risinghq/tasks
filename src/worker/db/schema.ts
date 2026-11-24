import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import {
  LABEL_COLORS,
  LISTS,
  ROLES,
  type ChecklistItem,
  type LabelColor,
  type ListId,
  type Role,
} from "../../shared/model";

/** A user signs in with the Google account that has their email. The account the migration creates has no email until it is claimed. */
export const users = sqliteTable(
  "users",
  {
    id: text().primaryKey(),
    email: text().unique(),
    name: text().notNull(),
    role: text({ enum: ROLES }).$type<Role>().notNull(),
    sessionVersion: integer("session_version").notNull().default(0),
    disabled: integer({ mode: "boolean" }).notNull().default(false),
    reportToken: text("report_token")
      .notNull()
      .unique()
      .default(sql`(lower(hex(randomblob(32))))`),
  },
  (table) => [
    check("email_lowercase", sql`${table.email} = lower(${table.email})`),
    check("role_known", sql`${table.role} in ('admin', 'member')`),
  ],
);

export const labels = sqliteTable(
  "labels",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    color: text({ enum: LABEL_COLORS }).$type<LabelColor>().notNull(),
  },
  (table) => [
    unique("labels_user_name").on(table.userId, table.name),
    check("color_known", sql`${table.color} in ('green', 'yellow', 'orange', 'red', 'purple', 'blue')`),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    labelId: text("label_id").references(() => labels.id, { onDelete: "set null" }),
    requester: text(),
    checklist: text({ mode: "json" }).$type<ChecklistItem[]>().notNull().default([]),
    list: text({ enum: LISTS }).$type<ListId>().notNull(),
    position: integer().notNull(),
    doneDate: text("done_date"),
  },
  (table) => [
    index("cards_group").on(table.userId, table.list, table.doneDate, table.position),
    check("done_date_iff_hecho", sql`(${table.list} = 'hecho') = (${table.doneDate} is not null)`),
  ],
);

/** Failed attempts per key in the current window. See `login-limit.ts`. A key is `bearer:` and an address for bad API tokens. */
export const loginAttempts = sqliteTable("login_attempts", {
  key: text().primaryKey(),
  attempts: integer().notNull(),
  /** Unix seconds. */
  windowStart: integer("window_start").notNull(),
  /** Unix seconds. Zero, or in the past, when the email is not locked. */
  lockedUntil: integer("locked_until").notNull().default(0),
});

/**
 * A member's personal API token. Only the SHA-256 of the token is stored. The
 * token itself is shown once, when it is made.
 */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** Unix seconds. */
    createdAt: integer("created_at").notNull(),
    /** Unix seconds of the last request, or null while unused. */
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [index("api_tokens_user").on(table.userId)],
);
