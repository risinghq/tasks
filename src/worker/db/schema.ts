import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  LABEL_COLORS,
  LISTS,
  WORKSPACE_ROLES,
  type ChecklistItem,
  type LabelColor,
  type ListId,
  type WorkspaceRole,
} from "../../shared/model";

/** A person who signs in with the Google account that has their email. */
export const users = sqliteTable(
  "users",
  {
    id: text().primaryKey(),
    email: text().notNull().unique(),
    name: text().notNull(),
    sessionVersion: integer("session_version").notNull().default(0),
  },
  (table) => [check("email_lowercase", sql`${table.email} = lower(${table.email})`)],
);

/** A board. Cards, labels and report links belong to a workspace. */
export const workspaces = sqliteTable("workspaces", {
  id: text().primaryKey(),
  name: text().notNull(),
  /** Unix seconds. */
  createdAt: integer("created_at").notNull(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text({ enum: WORKSPACE_ROLES }).$type<WorkspaceRole>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user").on(table.userId),
    check("workspace_role_known", sql`${table.role} in ('owner', 'member')`),
  ],
);

export const labels = sqliteTable(
  "labels",
  {
    id: text().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    color: text({ enum: LABEL_COLORS }).$type<LabelColor>().notNull(),
  },
  (table) => [
    unique("labels_workspace_name").on(table.workspaceId, table.name),
    check("color_known", sql`${table.color} in ('green', 'yellow', 'orange', 'red', 'purple', 'blue')`),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    labelId: text("label_id").references(() => labels.id, { onDelete: "set null" }),
    /** The member who does the card. Removing the member clears it in workspaces.ts. */
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    requester: text(),
    checklist: text({ mode: "json" }).$type<ChecklistItem[]>().notNull().default([]),
    list: text({ enum: LISTS }).$type<ListId>().notNull(),
    position: integer().notNull(),
    doneDate: text("done_date"),
  },
  (table) => [
    index("cards_group").on(table.workspaceId, table.list, table.doneDate, table.position),
    check("done_date_iff_hecho", sql`(${table.list} = 'hecho') = (${table.doneDate} is not null)`),
  ],
);

/**
 * One entry in a card's log: text, a file, or both. The file body lives in R2
 * under the key `files.ts` derives from the workspace, card and note ids.
 * Notes never appear on a report.
 */
export const notes = sqliteTable(
  "notes",
  {
    id: text().primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Unix seconds. */
    createdAt: integer("created_at").notNull(),
    text: text().notNull().default(""),
    fileName: text("file_name"),
    fileType: text("file_type"),
    fileSize: integer("file_size"),
  },
  (table) => [
    index("notes_card").on(table.cardId, table.createdAt),
    check("notes_not_empty", sql`${table.text} <> '' or ${table.fileName} is not null`),
  ],
);

/**
 * One shared read-only link to the weekly report. `label_id` limits the report
 * to the cards of one label, `member_id` to the cards assigned to one member.
 * With both null the link shows the whole workspace.
 */
export const reportLinks = sqliteTable(
  "report_links",
  {
    id: text().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    token: text()
      .notNull()
      .unique()
      .default(sql`(lower(hex(randomblob(32))))`),
    labelId: text("label_id").references(() => labels.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => users.id, { onDelete: "cascade" }),
    /** Unix seconds. */
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("report_links_workspace").on(table.workspaceId),
    /** At most one link per label. Nulls do not conflict. */
    unique("report_links_label").on(table.labelId),
    unique("report_links_member").on(table.workspaceId, table.memberId),
    /** One whole-workspace link per workspace, created on demand. */
    uniqueIndex("report_links_whole")
      .on(table.workspaceId)
      .where(sql`${table.labelId} is null and ${table.memberId} is null`),
    check("report_links_one_scope", sql`${table.labelId} is null or ${table.memberId} is null`),
  ],
);

/** Failed attempts per key in the current window. See `login-limit.ts`. A key is `bearer:` and an address for bad API tokens. */
export const loginAttempts = sqliteTable("login_attempts", {
  key: text().primaryKey(),
  attempts: integer().notNull(),
  /** Unix seconds. */
  windowStart: integer("window_start").notNull(),
  /** Unix seconds. Zero, or in the past, when the key is not locked. */
  lockedUntil: integer("locked_until").notNull().default(0),
});

/**
 * A member's personal API token, valid for one workspace. Only the SHA-256 of
 * the token is stored. The token itself is shown once, when it is made.
 */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** Unix seconds. */
    createdAt: integer("created_at").notNull(),
    /** Unix seconds of the last request, or null while unused. */
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [index("api_tokens_user").on(table.userId, table.workspaceId)],
);
