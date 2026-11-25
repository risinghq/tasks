import type { Page } from "@playwright/test";
import type { Workspace } from "../src/shared/model";
import { chooseWorkspace, expect, test } from "./fixtures";

/**
 * A workspace of its own for each test, so the members other specs add to the
 * personal one never show here. `remove` deletes it.
 */
async function workspaceWith(page: Page, name: string, members: { email: string; name: string }[]) {
  const workspace = (await (
    await page.request.post("/api/workspaces", { data: { name } })
  ).json()) as Workspace;
  const headers = { "X-Workspace": workspace.id };
  for (const member of members) {
    await page.request.post("/api/members", { headers, data: { ...member, role: "member" } });
  }
  return {
    async card(title: string) {
      await page.request.post("/api/cards", { headers, data: { title, list: "en_curso" } });
    },
    async label(labelName: string) {
      await page.request.post("/api/labels", { headers, data: { name: labelName, color: "blue" } });
    },
    remove: () => page.request.delete("/api/workspace", { headers }),
  };
}

const card = (page: Page, title: string) => page.locator("[data-card-id]", { hasText: title });

test("a company assigns cards, filters by Responsable and shares one employee's report", async ({
  page,
  tasks,
}) => {
  const beto = `Beto ${Date.now()}`;
  const space = await workspaceWith(page, "Equipo E2E", [
    { email: `beto-${Date.now()}@tasks.test`, name: beto },
  ]);
  await space.card("Para Beto");
  await space.card("Para nadie");
  await tasks.open();
  await chooseWorkspace(page, "Equipo E2E");
  await expect(card(page, "Para Beto")).toBeVisible();

  await card(page, "Para Beto").click();
  const back = page.getByRole("dialog", { name: "Tarjeta" });
  await back.getByRole("button", { name: "Responsable", exact: true }).click();
  await page.getByRole("option", { name: beto }).click();
  await expect(back.getByRole("button", { name: "Responsable", exact: true })).toContainText(beto);
  await page.keyboard.press("Escape");
  await expect(card(page, "Para Beto").getByRole("img", { name: `Responsable: ${beto}` })).toBeVisible();

  await page.getByRole("button", { name: "Filtrar", exact: true }).first().click();
  await page.getByRole("button", { name: "Responsable" }).click();
  await page.getByRole("option", { name: beto }).click();
  await page.keyboard.press("Escape");
  await expect(card(page, "Para Beto")).toBeVisible();
  await expect(card(page, "Para nadie")).toHaveCount(0);

  await page.getByRole("button", { name: "Compartir informe" }).click();
  const share = page.getByRole("dialog", { name: "Compartir informe" });
  await share.getByRole("button", { name: "Para" }).click();
  await page.getByRole("option", { name: beto }).click();
  await share.getByRole("button", { name: "Crear enlace" }).click();
  const row = share.getByRole("listitem").filter({ hasText: beto });
  const href = await row.getByRole("link", { name: "Abrir" }).getAttribute("href");

  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(beto);
  await expect(page.getByText("Para Beto")).toBeVisible();
  await expect(page.getByText("Para nadie")).toHaveCount(0);

  await space.remove();
});

/** Elements that scroll sideways: the page itself, or any box whose overflow-x lets it scroll. */
const SIDEWAYS = `[document.documentElement, ...document.querySelectorAll("*")]
  .filter((el) => el.scrollWidth > el.clientWidth + 1
    && (el === document.documentElement || ["auto", "scroll"].includes(getComputedStyle(el).overflowX)))
  .map((el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""))`;

test("no board view, card back or share dialog scrolls sideways from 320 to 1920px", async ({
  page,
  tasks,
}) => {
  const long = "Supercalifragilisticoespialidosoyconstantinopolitano";
  const space = await workspaceWith(page, "Ancho E2E", [
    { email: `larga-${Date.now()}@tasks.test`, name: `${long} Apellido` },
  ]);
  await space.card(`${long} ${long}`);
  await space.label(`Cliente ${long}`);
  await tasks.open();
  await chooseWorkspace(page, "Ancho E2E");
  await expect(card(page, long)).toBeVisible();

  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate<string[]>(SIDEWAYS), `board at ${width}px`).toEqual([]);

    await card(page, long).click();
    await expect(page.getByRole("dialog", { name: "Tarjeta" })).toBeVisible();
    expect(await page.evaluate<string[]>(SIDEWAYS), `card back at ${width}px`).toEqual([]);
    await page.keyboard.press("Escape");

    await switcherShare(page);
    const share = page.getByRole("dialog", { name: "Compartir informe" });
    await expect(share.getByRole("listitem").first()).toBeVisible();
    expect(await page.evaluate<string[]>(SIDEWAYS), `share dialog at ${width}px`).toEqual([]);
    await page.keyboard.press("Escape");
  }

  await space.remove();
});

/** Opens Compartir informe from the switcher, which every width shows. */
async function switcherShare(page: Page) {
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await page.getByRole("menuitem", { name: "Compartir informe" }).click();
}

test("a freelancer shares one link per client label, and sees no Responsable", async ({ page, tasks }) => {
  const space = await workspaceWith(page, "Solo E2E", []);
  await space.card("Sin asignar");
  await space.label("Cliente Uno");
  await tasks.open();
  await chooseWorkspace(page, "Solo E2E");
  await expect(card(page, "Sin asignar")).toBeVisible();

  await card(page, "Sin asignar").click();
  const back = page.getByRole("dialog", { name: "Tarjeta" });
  await expect(back.getByRole("button", { name: "Etiqueta", exact: true })).toBeVisible();
  await expect(back.getByRole("button", { name: "Responsable" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Filtrar", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Etiqueta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Responsable" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Compartir informe" }).click();
  const share = page.getByRole("dialog", { name: "Compartir informe" });
  await share.getByRole("button", { name: "Para" }).click();
  await expect(page.getByRole("option")).toHaveText(["Elegir etiqueta o persona", "Cliente Uno"]);
  await page.getByRole("option", { name: "Cliente Uno" }).click();
  await share.getByRole("button", { name: "Crear enlace" }).click();
  await expect(share.getByRole("listitem")).toHaveCount(2);
  await expect(share.getByText("Cada etiqueta y persona ya tiene su enlace.")).toBeVisible();

  await space.remove();
});
