import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { ReportLink } from "../shared/model";
import { nowSeconds } from "./clock";
import { randomToken } from "./crypto";
import { isUniqueViolation, type Db } from "./db/client";
import { labels, reportLinks, users, workspaceMembers, workspaces } from "./db/schema";

/** The label already has a link. One label carries at most one. */
export class ReportLinkConflict extends Error {}

/** The link a token names, or what `GET /api/report-links` lists. */
const linkColumns = {
  id: reportLinks.id,
  token: reportLinks.token,
  labelId: reportLinks.labelId,
  createdAt: reportLinks.createdAt,
};

function toReportLink(row: {
  id: string;
  token: string;
  createdAt: number;
  label: { id: string; name: string; color: string } | null;
}): ReportLink {
  return {
    id: row.id,
    token: row.token,
    label: row.label?.id ? (row.label as ReportLink["label"]) : null,
    createdAt: row.createdAt,
  };
}

const withLabel = {
  id: reportLinks.id,
  token: reportLinks.token,
  createdAt: reportLinks.createdAt,
  label: { id: labels.id, name: labels.name, color: labels.color },
};

/**
 * Every read and write of report links, for one workspace. The workspace id
 * comes from `requireWorkspace`, so a route cannot reach another workspace's
 * links.
 */
export function reportLinksOf(db: Db, workspaceId: string) {
  const mine = eq(reportLinks.workspaceId, workspaceId);

  const get = async (id: string): Promise<ReportLink | undefined> => {
    const row = await db
      .select(withLabel)
      .from(reportLinks)
      .leftJoin(labels, eq(labels.id, reportLinks.labelId))
      .where(and(eq(reportLinks.id, id), mine))
      .get();
    return row && toReportLink(row);
  };

  return {
    get,

    list(): Promise<ReportLink[]> {
      return db
        .select(withLabel)
        .from(reportLinks)
        .leftJoin(labels, eq(labels.id, reportLinks.labelId))
        .where(mine)
        .orderBy(asc(reportLinks.createdAt), asc(reportLinks.id))
        .then((rows) => rows.map(toReportLink));
    },

    /** A link for the whole workspace when `labelId` is null, or for one label of the workspace. */
    async create(labelId: string | null): Promise<ReportLink | undefined> {
      if (labelId) {
        const label = await db
          .select({ id: labels.id })
          .from(labels)
          .where(and(eq(labels.id, labelId), eq(labels.workspaceId, workspaceId)))
          .get();
        if (!label) return undefined;
      }
      const id = crypto.randomUUID();
      try {
        await db.insert(reportLinks).values({ id, workspaceId, labelId, createdAt: nowSeconds() });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ReportLinkConflict();
        throw error;
      }
      return (await get(id))!;
    },

    /** Replaces the link's token in one UPDATE. The old address stops working at once. */
    async regenerate(id: string): Promise<ReportLink | undefined> {
      const changed = await db
        .update(reportLinks)
        .set({ token: randomToken() })
        .where(and(eq(reportLinks.id, id), mine))
        .returning({ id: reportLinks.id });
      return changed.length > 0 ? get(id) : undefined;
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await db
        .delete(reportLinks)
        .where(and(eq(reportLinks.id, id), mine))
        .returning({ id: reportLinks.id });
      return deleted.length > 0;
    },
  };
}

/** The oldest whole-workspace link is the one `WorkspaceSettings.reportToken` names. */
async function workspaceLink(db: Db, workspaceId: string) {
  const row = await db
    .select(linkColumns)
    .from(reportLinks)
    .where(and(eq(reportLinks.workspaceId, workspaceId), isNull(reportLinks.labelId)))
    .orderBy(asc(reportLinks.createdAt), asc(reportLinks.id))
    .get();
  if (row) return row;
  return db
    .insert(reportLinks)
    .values({ id: crypto.randomUUID(), workspaceId, createdAt: nowSeconds() })
    .returning(linkColumns)
    .get();
}

/** The token behind `WorkspaceSettings.reportToken`, creating the whole-workspace link on demand. */
export async function reportTokenOf(db: Db, workspaceId: string): Promise<string> {
  return (await workspaceLink(db, workspaceId)).token;
}

/** Replaces the whole-workspace link's token with one UPDATE. The previous link stops working at once. */
export async function regenerateReportToken(db: Db, workspaceId: string): Promise<string> {
  const link = await workspaceLink(db, workspaceId);
  const row = await db
    .update(reportLinks)
    .set({ token: randomToken() })
    .where(eq(reportLinks.id, link.id))
    .returning({ token: reportLinks.token })
    .get();
  return row!.token;
}

export type ResolvedLink = {
  workspaceId: string;
  labelId: string | null;
};

/** The link a `/r/<token>` address names. */
export async function reportLinkByToken(db: Db, token: string): Promise<ResolvedLink | undefined> {
  return db
    .select({ workspaceId: reportLinks.workspaceId, labelId: reportLinks.labelId })
    .from(reportLinks)
    .where(eq(reportLinks.token, token))
    .get();
}

/**
 * What the report header shows about a workspace: its name (a personal one
 * reports under its owner's name, because "Personal" means nothing to a
 * reader) and the name of its first owner.
 */
export async function workspaceForReport(
  db: Db,
  workspaceId: string,
): Promise<{ name: string; ownerName: string } | undefined> {
  const row = await db
    .select({ name: sql<string>`coalesce(${users.name}, ${workspaces.name})` })
    .from(workspaces)
    .leftJoin(users, eq(users.id, workspaces.id))
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!row) return undefined;
  const owner = await db
    .select({ name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")))
    .orderBy(asc(users.name), asc(users.id))
    .get();
  return { name: row.name, ownerName: owner?.name ?? row.name };
}
