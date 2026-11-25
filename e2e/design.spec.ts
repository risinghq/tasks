import type { Page } from "@playwright/test";
import { chooseFromMenu, expect, test } from "./fixtures";

/** Paints the page background into a pixel and says whether it is dark. The script runs in the page, which these tests type without DOM globals. */
const isDark = (page: Page): Promise<boolean> =>
  page.evaluate(`(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  })()`);

test.describe("themes", () => {
  test("a dark system setting paints dark before any app script runs", async ({ page, tasks }) => {
    await tasks.board();
    await page.emulateMedia({ colorScheme: "dark" });
    // Without the app bundle only the document, its inline script and its stylesheet remain.
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.goto("/");
    expect(await isDark(page)).toBe(true);
  });

  test("a stored choice beats the system setting before any app script runs", async ({ page, tasks }) => {
    await tasks.board();
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => localStorage.setItem("tasks.theme", "dark"));
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.goto("/");
    expect(await isDark(page)).toBe(true);
  });

  test("the theme chosen in the user menu survives a reload", async ({ page, tasks }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await tasks.open();
    expect(await isDark(page)).toBe(false);

    await chooseFromMenu(page, "Oscuro", "menuitemradio");
    await expect.poll(() => isDark(page)).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await isDark(page)).toBe(true);

    await chooseFromMenu(page, "Sistema", "menuitemradio");
    await expect.poll(() => isDark(page)).toBe(false);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await isDark(page)).toBe(false);
  });
});

test.describe("narrow screens", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a tab bar shows one list at a time, starting on En curso, and Mover changes list", async ({
    page,
    tasks,
  }) => {
    await tasks.seed([
      { title: "Ahora", list: "en_curso" },
      { title: "Luego", list: "pendiente" },
    ]);
    await tasks.open();

    const tabs = page.getByRole("tablist", { name: "Listas" }).getByRole("tab");
    await expect(tabs).toHaveText(["Pendiente1", "Esta semana0", "En curso1", "Hecho0"]);
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(tasks.list("En curso")).toBeVisible();
    await expect(tasks.list("Pendiente")).toBeHidden();

    await tabs.nth(0).click();
    await expect(tasks.list("Pendiente")).toBeVisible();
    await expect(tasks.list("En curso")).toBeHidden();

    await tasks.card("Luego").click();
    const card = page.getByRole("dialog", { name: "Tarjeta" });
    await card.getByRole("button", { name: "Lista", exact: true }).click();
    await page.getByRole("option", { name: "En curso" }).click();
    await page.keyboard.press("Escape");
    await tabs.nth(2).click();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Ahora", "Luego"]);
  });

  test("the card back shows no horizontal scrollbar at narrow widths", async ({ page, tasks }) => {
    await tasks.seed([
      {
        title: `Título ${"a".repeat(60)}`,
        list: "en_curso",
        // The longest name a label takes.
        label: { name: `Etiqueta ${"b".repeat(31)}`, color: "blue" },
        checklist: [{ text: `Elemento ${"c".repeat(60)}`, done: false }],
        description: `Nota ${"d".repeat(60)}`,
      },
    ]);
    await tasks.open();

    const overflow = () =>
      page.evaluate<number>("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await tasks.card(`Título ${"a".repeat(60)}`).click();
      await expect(page.getByRole("dialog", { name: "Tarjeta" })).toBeVisible();
      await expect.poll(overflow).toBeLessThanOrEqual(0);
      await page.keyboard.press("Escape");
    }
  });

  test("the header fits the screen", async ({ page, tasks }) => {
    await tasks.open();
    const overflow = await page.evaluate<number>("document.documentElement.scrollWidth - innerWidth");
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator("header [aria-haspopup='menu']")).toBeInViewport({ ratio: 1 });
  });
});

test.describe("empty lists", () => {
  test("each empty list says what it is for and keeps its composer", async ({ tasks }) => {
    await tasks.open();
    for (const name of ["Pendiente", "Esta semana", "En curso", "Hecho"]) {
      const list = tasks.list(name);
      await expect(list.getByRole("paragraph")).toHaveCount(1);
      await expect(list.getByRole("button", { name: "Añade una tarjeta" })).toBeVisible();
    }
    await expect(tasks.list("Hecho").getByRole("button", { name: "Semanas anteriores" })).toHaveCount(0);
  });

  test("a card shows a badge row only when it has something to summarize", async ({ tasks }) => {
    await tasks.seed([
      { title: "Sola", list: "en_curso" },
      { title: "Con nota", list: "en_curso", description: "Detalle" },
    ]);
    await tasks.open();
    await expect(tasks.card("Sola").getByLabel("Tiene descripción")).toHaveCount(0);
    await expect(tasks.card("Con nota").getByLabel("Tiene descripción")).toBeVisible();
  });
});
