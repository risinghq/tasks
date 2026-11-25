import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { LabelColor, ReportLink } from "../shared/model";
import { nowSeconds } from "./clock";
import { randomToken } from "./crypto";
import { isUniqueViolation, type Db } from "./db/client";
import { labels, reportLinks, users, workspaceMembers, workspaces } from "./db/schema";

/** The label or member already has a link. Each carries at most one. */
export class ReportLinkConflict extends Error {}

/** The whole-workspace link is permanent: it can be regenerated, not deleted. */
export class WholeLinkPermanent extends Error {}

export type LinkScope = { labelId: string } | { memberId: string };

const scopedColumns = {
  id: reportLinks.id,
  token: reportLinks.token,
  createdAt: reportLinks.createdAt,
  label: { id: labels.id, name: labels.name, color: labels.color },
  member: { id: users.id, name: users.name },
};

type ScopedRow = {
  id: string;
  token: string;
  createdAt: number;
  label: { id: string; name: string; color: LabelColor } | null;
  member: { id: string; name: string } | null;
};

function toReportLink(row: ScopedRow): ReportLink {
  return {
    id: row.id,
    token: row.token,
    label: row.label?.id ? row.label : null,
    member: row.member?.id ? row.member : null,
    createdAt: row.createdAt,
  };
}

const isWhole = and(isNull(reportLinks.labelId), isNull(reportLinks.memberId));

/**
 * Every read and write of report links, for one workspace. The workspace id
 * comes from `requireWorkspace`, so a route cannot reach another workspace's
 * links.
 */
export function reportLinksOf(db: Db, workspaceId: string) {
  const mine = eq(reportLinks.workspaceId, workspaceId);

  const select = () =>
    db
      .select(scopedColumns)
      .from(reportLinks)
      .leftJoin(labels, eq(labels.id, reportLinks.labelId))
      .leftJoin(users, eq(users.id, reportLinks.memberId));

  const get = async (id: string): Promise<ReportLink | undefined> => {
    const row = await select()
      .where(and(eq(reportLinks.id, id), mine))
      .get();
    return row && toReportLink(row);
  };

  /** Creates the whole-workspace link on first use. The partial unique index keeps it single. */
  const ensureWhole = async (): Promise<void> => {
    await db
      .insert(reportLinks)
      .values({ id: crypto.randomUUID(), workspaceId, createdAt: nowSeconds() })
      .onConflictDoNothing();
  };

  const scopeExists = async (scope: LinkScope): Promise<boolean> => {
    const row =
      "labelId" in scope
        ? await db
            .select({ id: labels.id })
            .from(labels)
            .where(and(eq(labels.id, scope.labelId), eq(labels.workspaceId, workspaceId)))
            .get()
        : await db
            .select({ id: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(
              and(eq(workspaceMembers.userId, scope.memberId), eq(workspaceMembers.workspaceId, workspaceId)),
            )
            .get();
    return row !== undefined;
  };

  return {
    get,

    /** The whole-workspace link first, then the scoped links, oldest first. */
    async list(): Promise<ReportLink[]> {
      await ensureWhole();
      const rows = await select()
        .where(mine)
        .orderBy(sql`${isWhole} desc`, asc(reportLinks.createdAt), asc(reportLinks.id));
      return rows.map(toReportLink);
    },

    /** A link for one label or one member of the workspace. Undefined when that label or member is not here. */
    async create(scope: LinkScope): Promise<ReportLink | undefined> {
      if (!(await scopeExists(scope))) return undefined;
      const id = crypto.randomUUID();
      try {
        await db.insert(reportLinks).values({ id, workspaceId, ...scope, createdAt: nowSeconds() });
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
      const link = await get(id);
      if (!link) return false;
      if (!link.label && !link.member) throw new WholeLinkPermanent();
      await db.delete(reportLinks).where(and(eq(reportLinks.id, id), mine));
      return true;
    },
  };
}

export type ResolvedLink = {
  workspaceId: string;
  labelId: string | null;
  memberId: string | null;
};

/** The link a `/r/<token>` address names. */
export async function reportLinkByToken(db: Db, token: string): Promise<ResolvedLink | undefined> {
  return db
    .select({
      workspaceId: reportLinks.workspaceId,
      labelId: reportLinks.labelId,
      memberId: reportLinks.memberId,
    })
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
