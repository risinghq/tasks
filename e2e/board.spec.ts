import type { Page } from "@playwright/test";
import type { Card } from "../src/shared/model";
import { chooseFromMenu, expect, lift, test } from "./fixtures";

const NOT_SAVED = "No se pudo guardar.";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Tarjeta" });
const field = (page: Page) => dialog(page).getByRole("textbox", { name: "Título de la tarjeta" });

test.describe("drag and drop", () => {
  test("a card dropped on another list shows there before the write returns, and stays after a reload", async ({
    page,
    tasks,
  }) => {
    await tasks.seed([
      { title: "Uno", list: "en_curso" },
      { title: "Dos", list: "en_curso" },
      { title: "Tres", list: "pendiente" },
    ]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/cards/*/move", async (route) => {
      await gate;
      await route.continue();
    });
    await tasks.open();

    const active = tasks.list("En curso").locator("[data-card-id]");
    await lift(page, tasks.card("Tres"), tasks.card("Uno"), "top");
    await page.mouse.up();

    await expect(active).toHaveText(["Tres", "Uno", "Dos"]);
    await expect(tasks.list("Pendiente").locator("[data-card-id]")).toHaveCount(0);
    // The write is still held, and the card does not move when it returns.
    release();
    await page.waitForResponse((res) => res.url().includes("/move"));
    await expect(active).toHaveText(["Tres", "Uno", "Dos"]);

    await page.reload();
    await expect(active).toHaveText(["Tres", "Uno", "Dos"]);
  });

  test("a failed write puts the card back and offers to retry", async ({ page, tasks }) => {
    await tasks.seed([
      { title: "Uno", list: "en_curso" },
      { title: "Tres", list: "pendiente" },
    ]);
    await page.route("**/api/cards/*/move", (route) => route.fulfill({ status: 500, json: { error: "x" } }));
    await tasks.open();

    await lift(page, tasks.card("Tres"), tasks.card("Uno"), "top");
    await page.mouse.up();

    const toast = page.getByRole("status").filter({ hasText: NOT_SAVED });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await expect(tasks.list("Pendiente").locator("[data-card-id]")).toHaveText(["Tres"]);
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Uno"]);

    await page.unroute("**/api/cards/*/move");
    await toast.getByRole("button", { name: "Reintentar" }).click();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Tres", "Uno"]);
    await page.reload();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Tres", "Uno"]);
  });

  test("a card dropped on a collapsed day header gets that day's date", async ({ page, tasks }) => {
    const { today } = await tasks.board();
    const earlier = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const [, moving] = await tasks.seed([
      { title: "Antes", list: "hecho", doneDate: earlier },
      { title: "Movida", list: "en_curso" },
    ]);
    await tasks.open();

    const done = tasks.list("Hecho");
    // On a Monday the day before belongs to an earlier week, and the board no longer lists the card once dropped.
    const older = done.getByRole("button", { name: "Semanas anteriores" });
    if (await older.isVisible()) await older.click();
    const header = done.getByRole("button", { expanded: false });
    await expect(header).toBeVisible();

    await lift(page, tasks.card("Movida"), header);
    await page.mouse.up();

    await expect(header).toContainText("2");
    await expect
      .poll(
        async () => ((await (await page.request.get(`/api/cards/${moving!.id}`)).json()) as Card).doneDate,
      )
      .toBe(earlier);
  });
});

test.describe("card back", () => {
  test("the title shows at full height and focus lands on the card, not delete", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Rediseño web", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Rediseño web").click();

    const title = field(page);
    await expect(title).toBeVisible();
    const selector = "dialog [aria-label='Título de la tarjeta']";
    const line: number = await page.evaluate(
      `parseFloat(getComputedStyle(document.querySelector("${selector}")).lineHeight)`,
    );
    await expect
      .poll(() => page.evaluate(`document.querySelector("${selector}").offsetHeight`))
      .toBeGreaterThan(line);

    await expect(dialog(page).getByRole("button", { name: "Eliminar" })).not.toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(`(() => {
          const el = document.activeElement;
          return el instanceof HTMLDialogElement || el?.getAttribute("aria-label") === "Título de la tarjeta";
        })()`),
      )
      .toBe(true);
  });

  test("Enter saves the title", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Viejo", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Viejo").click();

    await field(page).click();
    await field(page).fill("Nuevo");
    await field(page).press("Enter");

    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Nuevo"]);
    await expect.poll(async () => (await tasks.board()).cards[0]?.title).toBe("Nuevo");
  });

  test("leaving the title field saves it", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Viejo", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Viejo").click();

    await field(page).click();
    await field(page).fill("Nuevo");
    await dialog(page).getByRole("heading", { name: "Descripción" }).click();

    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Nuevo"]);
    await expect.poll(async () => (await tasks.board()).cards[0]?.title).toBe("Nuevo");
  });

  test("Escape restores the old title", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Viejo", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Viejo").click();

    await field(page).click();
    await field(page).fill("Nuevo");
    await field(page).press("Escape");

    await expect(field(page)).toHaveValue("Viejo");
    await expect(dialog(page)).toBeVisible();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Viejo"]);
    expect((await tasks.board()).cards[0]?.title).toBe("Viejo");
  });

  test("ticking a checklist item saves at once and shows the progress", async ({ page, tasks }) => {
    await tasks.seed([
      {
        title: "Con lista",
        list: "en_curso",
        checklist: ["a", "b", "c", "d"].map((text) => ({ text, done: false })),
      },
    ]);
    await tasks.open();
    await tasks.card("Con lista").click();

    const progress = dialog(page).getByRole("progressbar");
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "PATCH"),
      dialog(page).getByRole("checkbox", { name: "Marcar: a" }).check(),
    ]);
    await expect(progress).toHaveAttribute("aria-valuenow", "25");
    await expect
      .poll(
        async () =>
          (await tasks.board()).cards.find((card) => card.title === "Con lista")?.checklist[0]?.done,
      )
      .toBe(true);

    await page.reload();
    await expect(dialog(page).getByRole("checkbox", { name: "Marcar: a" })).toBeChecked();
    await expect(dialog(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    await expect(dialog(page).getByText("25%")).toBeVisible();
  });

  test("a card URL opens the card and the back button closes it", async ({ page, tasks }) => {
    const [card] = await tasks.seed([{ title: "Enlazada", list: "en_curso" }]);
    await tasks.open();

    await tasks.card("Enlazada").click();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(`/c/${card!.id}`);

    await page.goBack();
    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL("/");

    await tasks.open(`/c/${card!.id}`);
    await expect(field(page)).toHaveValue("Enlazada");
    await expect(tasks.list("En curso")).toBeVisible();
  });

  test("an unknown card URL shows the board and a notice", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Otra", list: "en_curso" }]);
    await tasks.open("/c/00000000-0000-4000-8000-000000000000");

    await expect(page.getByRole("status").filter({ hasText: "No se encontró la tarjeta." })).toBeVisible();
    await expect(dialog(page)).toBeHidden();
    await expect(tasks.card("Otra")).toBeVisible();
    await expect(page).toHaveURL("/");
  });
});

test("quick edit saves the title with Enter", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Viejo", list: "en_curso" }]);
  await tasks.open();

  await tasks.card("Viejo").hover();
  await page.keyboard.press("e");
  const title = page.getByRole("textbox", { name: "Título de la tarjeta" });
  await expect(title).toBeFocused();
  await title.fill("Nuevo");
  await expect(
    page.getByRole("button", {
      name: /^(Abrir tarjeta|Etiqueta|Solicitante|Fecha|Mover|Eliminar)$/,
    }),
  ).toHaveText(["Abrir tarjeta", "Etiqueta", "Solicitante", "Fecha", "Mover", "Eliminar"]);
  await title.press("Enter");

  await expect(title).toBeHidden();
  await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Nuevo"]);
  await expect.poll(async () => (await tasks.board()).cards[0]?.title).toBe("Nuevo");
});

test.describe("completion circle", () => {
  test("finishing puts the card at the top of today and the check puts it back in En curso", async ({
    page,
    tasks,
  }) => {
    await tasks.seed([
      { title: "Vieja", list: "hecho" },
      { title: "Nueva", list: "en_curso" },
    ]);
    await tasks.open();

    await tasks.card("Nueva").getByRole("button", { name: "Marcar como hecha" }).click();
    await expect(tasks.list("Hecho").locator("[data-card-id]")).toHaveText(["Nueva", "Vieja"]);
    await page.reload();
    await expect(tasks.list("Hecho").locator("[data-card-id]")).toHaveText(["Nueva", "Vieja"]);

    await tasks.card("Nueva").getByRole("button", { name: "Mover a En curso" }).click();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Nueva"]);
    await expect.poll(async () => (await tasks.board()).cards.map((card) => card.list)).toContain("en_curso");
    await page.reload();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Nueva"]);
  });

  test("the circle on the card back finishes the card", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Tarea", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Tarea").click();

    await dialog(page).getByRole("button", { name: "Marcar como hecha" }).click();

    await expect(dialog(page).getByText("Hecho", { exact: true })).toBeVisible();
    await expect(tasks.list("Hecho").locator("[data-card-id]")).toHaveText(["Tarea"]);
    await expect.poll(async () => (await tasks.board()).cards[0]?.list).toBe("hecho");
  });
});

test("the composer stays open after Enter and the cards land in order", async ({ page, tasks }) => {
  await tasks.open();

  const active = tasks.list("En curso");
  await active.getByRole("button", { name: "Añade una tarjeta" }).click();
  const input = active.getByRole("textbox", { name: "Título de la tarjeta" });
  await input.fill("Primera");
  await input.press("Enter");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await input.fill("Segunda");
  await input.press("Enter");

  await expect(active.locator("[data-card-id]")).toHaveText(["Primera", "Segunda"]);
  await expect(input).toBeVisible();
  await page.reload();
  await expect(active.locator("[data-card-id]")).toHaveText(["Primera", "Segunda"]);
});

test("the composer stops a title at the length the server accepts", async ({ page, tasks }) => {
  await tasks.open();

  const active = tasks.list("En curso");
  await active.getByRole("button", { name: "Añade una tarjeta" }).click();
  const input = active.getByRole("textbox", { name: "Título de la tarjeta" });
  await input.pressSequentially("x".repeat(250));
  await input.press("Enter");

  await expect(active.locator("[data-card-id]")).toHaveCount(1);
  await expect.poll(async () => (await tasks.board()).cards[0]?.title).toBe("x".repeat(200));
  await expect(page.getByRole("status").filter({ hasText: NOT_SAVED })).toHaveCount(0);
});

test("a card opened before its create is answered shows its card back", async ({ page, tasks }) => {
  await tasks.open();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/cards", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await held;
    await route.fallback();
  });

  const active = tasks.list("En curso");
  await active.getByRole("button", { name: "Añade una tarjeta" }).click();
  await active.getByRole("textbox", { name: "Título de la tarjeta" }).fill("Recién creada");
  await page.keyboard.press("Enter");
  await tasks.card("Recién creada").click();

  await expect(field(page)).toHaveValue("Recién creada");
  await expect(page.getByText("No se encontró la tarjeta.")).toBeHidden();

  release();
  await expect.poll(async () => (await tasks.board()).cards.length).toBe(1);
  const id = (await tasks.board()).cards[0]!.id;
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/c/${id}$`));
  await expect(field(page)).toHaveValue("Recién creada");
});

test.describe("delete", () => {
  test.beforeEach(async ({ page }) => {
    // The undo window is six seconds of timers. The tests move the clock instead of waiting.
    await page.clock.install();
  });

  test("Deshacer brings the card back and it is never deleted", async ({ page, tasks }) => {
    await tasks.seed([
      { title: "Uno", list: "en_curso" },
      { title: "Dos", list: "en_curso" },
    ]);
    await tasks.open();

    await tasks.card("Uno").click();
    await dialog(page).getByRole("button", { name: "Eliminar" }).click();
    const active = tasks.list("En curso").locator("[data-card-id]");
    await expect(active).toHaveText(["Dos"]);

    const toast = page.getByRole("status").filter({ hasText: "Tarjeta eliminada." });
    await toast.getByRole("button", { name: "Deshacer" }).click();
    await expect(active).toHaveText(["Uno", "Dos"]);

    await page.clock.fastForward(10_000);
    await page.reload();
    await expect(active).toHaveText(["Uno", "Dos"]);
  });

  test("the card is deleted when the toast closes", async ({ page, tasks }) => {
    await tasks.seed([
      { title: "Uno", list: "en_curso" },
      { title: "Dos", list: "en_curso" },
    ]);
    await tasks.open();

    await tasks.card("Uno").click();
    await dialog(page).getByRole("button", { name: "Eliminar" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Tarjeta eliminada." });
    await expect(toast).toBeVisible();
    expect((await tasks.board()).cards).toHaveLength(2);

    await page.clock.fastForward(6_500);
    await expect(toast).toBeHidden();
    await expect.poll(async () => (await tasks.board()).cards.length).toBe(1);
    await page.reload();
    await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Dos"]);
  });
});

test("the filter hides cards and a reload keeps it", async ({ page, tasks }) => {
  await tasks.seed([
    { title: "Informe mensual", list: "en_curso" },
    { title: "Curso de SQL", list: "pendiente" },
    { title: "Revisar correo", list: "esta_semana", description: "mirar el informe" },
  ]);
  await tasks.open();

  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.getByRole("textbox", { name: "Texto" }).fill("informe");
  await expect(page.getByText("2 tarjetas", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Filtrar" })).toBeFocused();

  await expect(tasks.card("Informe mensual")).toBeVisible();
  await expect(tasks.card("Revisar correo")).toBeVisible();
  await expect(tasks.card("Curso de SQL")).toBeHidden();
  await expect(page.getByRole("button", { name: "Filtrar" })).toContainText("1");

  await page.reload();
  await expect(tasks.card("Curso de SQL")).toBeHidden();
  await expect(tasks.card("Informe mensual")).toBeVisible();

  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.getByRole("button", { name: "Limpiar filtro" }).click();
  await page.keyboard.press("Escape");
  await expect(tasks.card("Curso de SQL")).toBeVisible();
});

test.describe("labels", () => {
  test("a card shows its label as a colored dot and its name", async ({ tasks }) => {
    await tasks.seed([
      { title: "Uno", list: "en_curso", label: { name: "Desarrollo", color: "green" } },
      { title: "Dos", list: "pendiente", label: { name: "Cursos", color: "purple" } },
      { title: "Tres", list: "pendiente" },
    ]);
    await tasks.open();

    const label = tasks.card("Uno").locator("[data-label]");
    await expect(label).toHaveCount(1);
    await expect(label).toContainText("Desarrollo");
    await expect(tasks.card("Dos")).toContainText("Cursos");
    await expect(tasks.card("Tres").locator("[data-label]")).toHaveCount(0);
    await expect(label.locator("span").first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("a label made and picked on the card back shows its dot and name on the board", async ({
    page,
    tasks,
  }) => {
    await tasks.seed([{ title: "Sin color", list: "en_curso" }]);
    await tasks.open();
    const stripe = tasks.card("Sin color").locator("[data-label] > span:first-child");
    await expect(stripe).toHaveCount(0);

    await tasks.card("Sin color").click();
    await dialog(page).getByRole("button", { name: "Etiqueta", exact: true }).click();
    await page.getByRole("button", { name: "Crear etiqueta" }).click();
    await page.getByRole("textbox", { name: "Nombre" }).fill("Urgente");
    await page.getByRole("radio", { name: "Rojo" }).check({ force: true });
    await page.getByRole("button", { name: "Crear", exact: true }).click();

    await expect(dialog(page).getByText("Urgente")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Cerrar" }).click();
    await expect(stripe).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const red: string = await page.evaluate(`getComputedStyle(
      [...document.querySelectorAll("[data-card-id]")]
        .find((card) => card.textContent.includes("Sin color"))
        .querySelector("[data-label] > span:first-child")
    ).backgroundColor`);
    // Closing the card back goes one step back in history; a reload must not cut that short.
    await expect(page).toHaveURL(/\/$/);
    await expect
      .poll(async () => (await tasks.board()).cards[0]?.labelId)
      .toBe((await tasks.board()).labels[0]!.id);
    await page.reload();
    await expect(stripe).toHaveCSS("background-color", red);

    // Recoloring changes the stripe, and "Sin etiqueta" removes it.
    await tasks.card("Sin color").click();
    await dialog(page).getByRole("button", { name: "Etiqueta", exact: true }).click();
    await page.getByRole("button", { name: "Editar etiqueta Urgente" }).click();
    await page.getByRole("radio", { name: "Azul" }).check({ force: true });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(stripe).not.toHaveCSS("background-color", red);
    await page.getByRole("button", { name: "Sin etiqueta" }).click();
    await dialog(page).getByRole("button", { name: "Cerrar" }).click();
    await expect(stripe).toHaveCount(0);
  });

  test("deleting a label clears it from the board", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Marcada", list: "en_curso", label: { name: "Temporal", color: "orange" } }]);
    await tasks.open();
    await expect(tasks.card("Marcada").locator("[data-label]")).toHaveCount(1);

    await tasks.card("Marcada").click();
    await dialog(page).getByRole("button", { name: "Etiqueta", exact: true }).click();
    await page.getByRole("button", { name: "Editar etiqueta Temporal" }).click();
    await page.locator("form").getByRole("button", { name: "Eliminar", exact: true }).click();
    await page.getByRole("button", { name: "Sí, eliminar" }).click();
    // The popover stays open on the list of labels.
    await page.keyboard.press("Escape");
    await dialog(page).getByRole("button", { name: "Cerrar" }).click();

    await expect(tasks.card("Marcada").locator("[data-label]")).toHaveCount(0);
    expect((await tasks.board()).labels).toEqual([]);
  });

  test("the filter keeps the cards of one label, or of none", async ({ page, tasks }) => {
    await tasks.seed([
      { title: "Verde uno", list: "en_curso", label: { name: "Desarrollo", color: "green" } },
      { title: "Morada uno", list: "en_curso", label: { name: "Cursos", color: "purple" } },
      { title: "Libre uno", list: "en_curso" },
    ]);
    await tasks.open();

    const etiqueta = page.getByRole("button", { name: "Etiqueta" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await etiqueta.click();
    await page.getByRole("option", { name: "Cursos" }).click();
    await expect(tasks.card("Morada uno")).toBeVisible();
    await expect(tasks.card("Verde uno")).toBeHidden();
    await expect(tasks.card("Libre uno")).toBeHidden();

    await etiqueta.click();
    await page.getByRole("option", { name: "Sin etiqueta" }).click();
    await expect(tasks.card("Libre uno")).toBeVisible();
    await expect(tasks.card("Morada uno")).toBeHidden();

    await page.getByRole("button", { name: "Limpiar filtro" }).click();
    await expect(tasks.card("Verde uno")).toBeVisible();
    await expect(tasks.card("Morada uno")).toBeVisible();
  });
});

test.describe("four lists", () => {
  test("each list has its own count and composer, and a card added to Esta semana stays there", async ({
    page,
    tasks,
  }) => {
    await tasks.seed([
      { title: "Algún día", list: "pendiente" },
      { title: "Planeada", list: "esta_semana" },
    ]);
    await tasks.open();

    for (const name of ["Pendiente", "Esta semana", "En curso", "Hecho"]) {
      await expect(tasks.list(name).getByRole("button", { name: "Añade una tarjeta" })).toBeVisible();
    }
    await expect(tasks.list("Pendiente").locator("header")).toContainText("1");
    await expect(tasks.list("Esta semana").locator("header")).toContainText("1");
    await expect(tasks.list("En curso").locator("header")).toContainText("0");

    const week = tasks.list("Esta semana");
    await week.getByRole("button", { name: "Añade una tarjeta" }).click();
    await week.getByRole("textbox", { name: "Título de la tarjeta" }).fill("Otra");
    await page.keyboard.press("Enter");
    await expect(week.locator("[data-card-id]")).toHaveText(["Planeada", "Otra"]);
    await expect(week.locator("header")).toContainText("2");
    await page.reload();
    await expect(week.locator("[data-card-id]")).toHaveText(["Planeada", "Otra"]);
  });

  test("the move popover offers the four lists", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Viajera", list: "pendiente" }]);
    await tasks.open();
    await tasks.card("Viajera").click();

    await dialog(page).getByRole("button", { name: "Mover", exact: true }).click();
    await expect(page.getByLabel("Lista", { exact: true }).locator("option")).toHaveText([
      "Pendiente (actual)",
      "Esta semana",
      "En curso",
      "Hecho",
    ]);
    await page.getByLabel("Lista", { exact: true }).selectOption("esta_semana");
    await page.getByRole("button", { name: "Mover", exact: true }).last().click();

    await expect(tasks.list("Esta semana").locator("[data-card-id]")).toHaveText(["Viajera"]);
    await expect.poll(async () => (await tasks.board()).cards[0]?.list).toBe("esta_semana");
  });
});

test("Escape cancels a drag and the card stays where it was", async ({ page, tasks }) => {
  await tasks.seed([
    { title: "Uno", list: "en_curso" },
    { title: "Tres", list: "pendiente" },
  ]);
  await tasks.open();

  await lift(page, tasks.card("Tres"), tasks.card("Uno"), "top");
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(tasks.list("Pendiente").locator("[data-card-id]")).toHaveText(["Tres"]);
  await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Uno"]);
  expect((await tasks.board()).cards.map((card) => card.list).toSorted()).toEqual(["en_curso", "pendiente"]);
});

test("an empty list takes a dropped card", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Sola", list: "pendiente" }]);
  await tasks.open();

  await lift(
    page,
    tasks.card("Sola"),
    tasks.list("En curso").getByRole("button", { name: "Añade una tarjeta" }),
  );
  await page.mouse.up();

  await expect(tasks.list("En curso").locator("[data-card-id]")).toHaveText(["Sola"]);
  await expect.poll(async () => (await tasks.board()).cards[0]?.list).toBe("en_curso");
});

test.describe("keyboard shortcuts", () => {
  test("n opens the composer of the hovered list and ? lists the shortcuts", async ({ page, tasks }) => {
    await tasks.open();

    await tasks.list("Hecho").hover();
    await page.keyboard.press("n");
    await expect(tasks.list("Hecho").getByRole("textbox", { name: "Título de la tarjeta" })).toBeFocused();
    await page.keyboard.press("Escape");

    await page.mouse.move(0, 400);
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Atajos de teclado" });
    await expect(help.getByRole("row")).toHaveCount(7);
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();

    await chooseFromMenu(page, "Atajos de teclado");
    await expect(help).toBeVisible();
  });

  test("Enter opens the focused card", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Foco", list: "en_curso" }]);
    await tasks.open();

    await page.locator("[data-card-id]").focus();
    await page.keyboard.press("Enter");
    await expect(field(page)).toHaveValue("Foco");
  });
});

test.describe("card back fields", () => {
  test("the description saves with Ctrl+Enter and Escape cancels", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Con nota", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Con nota").click();

    await dialog(page).getByText("Añade una descripción más detallada…").click();
    const text = dialog(page).getByRole("textbox", { name: "Descripción" });
    await text.fill("No se guarda");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByText("Añade una descripción más detallada…")).toBeVisible();

    await dialog(page).getByText("Añade una descripción más detallada…").click();
    await text.fill("Texto final");
    await text.press("Control+Enter");
    await expect(dialog(page).getByText("Texto final")).toBeVisible();
    await expect.poll(async () => (await tasks.board()).cards[0]?.description).toBe("Texto final");
  });

  test("a full checklist offers no more items", async ({ page, tasks }) => {
    const checklist = Array.from({ length: 100 }, (_, i) => ({ text: `Elemento ${i + 1}`, done: false }));
    await tasks.seed([{ title: "Llena", list: "en_curso", checklist }]);
    await tasks.open();
    await tasks.card("Llena").click();

    await expect(dialog(page).getByRole("checkbox")).toHaveCount(100);
    await expect(dialog(page).getByRole("button", { name: "Añadir un elemento" })).toHaveCount(0);
    await expect(dialog(page).getByRole("textbox", { name: "Nuevo elemento" })).toHaveCount(0);
  });

  test("the checklist composer stays open after Enter", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Con lista", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Con lista").click();

    await dialog(page).getByRole("button", { name: "Checklist", exact: true }).click();
    const input = dialog(page).getByRole("textbox", { name: "Nuevo elemento" });
    await input.fill("Primero");
    await input.press("Enter");
    await expect(input).toBeFocused();
    await input.fill("Segundo");
    await input.press("Enter");

    await expect(dialog(page).getByRole("checkbox")).toHaveCount(2);
    await expect
      .poll(async () => (await tasks.board()).cards[0]?.checklist.map((item) => item.text))
      .toEqual(["Primero", "Segundo"]);
  });

  test("the date popover refuses a future date", async ({ page, tasks }) => {
    const { today } = await tasks.board();
    await tasks.seed([{ title: "Hecha", list: "hecho" }]);
    await tasks.open();
    await tasks.card("Hecha").click();

    await dialog(page).getByRole("button", { name: "Fecha", exact: true }).click();
    const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const popover = page.getByRole("dialog", { name: "Fecha de término" });
    await popover.getByRole("textbox").fill(tomorrow);
    await expect(page.getByText("La fecha no puede ser futura.")).toBeVisible();
    await expect(popover.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  test("Mover on the card back sends a card to Hecho", async ({ page, tasks }) => {
    await tasks.seed([{ title: "Viajera", list: "en_curso" }]);
    await tasks.open();
    await tasks.card("Viajera").click();

    await dialog(page).getByRole("button", { name: "Mover", exact: true }).click();
    await page.getByLabel("Lista", { exact: true }).selectOption("hecho");
    await page.getByRole("button", { name: "Mover", exact: true }).last().click();

    await expect(tasks.list("Hecho").locator("[data-card-id]")).toHaveText(["Viajera"]);
    await expect.poll(async () => (await tasks.board()).cards[0]?.list).toBe("hecho");
  });
});
