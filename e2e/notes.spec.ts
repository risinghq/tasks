import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type Content = { text?: string; file?: { name: string; type: string; body: string } };

// Browser code goes in as strings: the e2e types have no DOM library.
const TRANSFER = `({ text, file }) => {
  const data = new DataTransfer();
  if (text) data.setData("text/plain", text);
  if (file) data.items.add(new File([file.body], file.name, { type: file.type }));
  return data;
}`;
const PASTE = `(clipboardData) => (document.activeElement ?? document.body).dispatchEvent(
  new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }))`;

/** A clipboard or drag payload. Playwright cannot fill the system clipboard, so the tests build the DataTransfer. */
const payload = (page: Page, content: Content) =>
  page.evaluateHandle(`(${TRANSFER})(${JSON.stringify(content)})`);

/** Pastes where a real Ctrl+V lands: on the focused element. */
async function paste(page: Page, content: Content) {
  await page.evaluate(`(${PASTE})((${TRANSFER})(${JSON.stringify(content)}))`);
}

async function dropOn(target: Locator, content: Content) {
  const dataTransfer = await payload(target.page(), content);
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}

const back = (page: Page) => page.getByRole("dialog", { name: "Tarjeta" });
const entries = (page: Page) => back(page).locator("[data-note-id]");

test("text pasted over a card on the board becomes its note", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Visita al cliente", list: "en_curso" }]);
  await tasks.open();

  await tasks.card("Visita al cliente").hover();
  await paste(page, { text: "Av. Larco 123, Miraflores" });
  await expect(page.getByText("Nota añadida.")).toBeVisible();
  await expect(tasks.card("Visita al cliente").getByRole("img", { name: "1 nota" })).toBeVisible();

  await page.getByRole("button", { name: "Ver" }).click();
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText("Av. Larco 123, Miraflores");
});

test("a file dropped on a card on the board becomes its note", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Contrato", list: "en_curso" }]);
  await tasks.open();

  await dropOn(tasks.card("Contrato"), {
    file: { name: "contrato.txt", type: "text/plain", body: "firmado" },
  });
  await expect(page.getByText("Nota añadida.")).toBeVisible();
  await expect(tasks.card("Contrato").getByRole("img", { name: "1 nota" })).toBeVisible();

  await tasks.card("Contrato").click();
  const link = entries(page)
    .first()
    .getByRole("link", { name: /contrato\.txt/ });
  await expect(link).toBeVisible();
  const file = await page.request.get((await link.getAttribute("href"))!);
  expect(await file.text()).toBe("firmado");
});

test("`a` opens the card back ready to note, and a note is edited and deleted", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Llamada", list: "en_curso" }]);
  await tasks.open();

  await tasks.card("Llamada").hover();
  await page.keyboard.press("a");
  const box = back(page).getByRole("textbox", { name: "Nueva nota" });
  await expect(box).toBeFocused();
  await page.keyboard.type("Llamó Ana");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("dice que mañana");
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("");
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText("Llamó Ana\ndice que mañana");

  await entries(page).first().getByRole("button", { name: "Editar" }).click();
  const edit = entries(page).first().getByRole("textbox", { name: "Texto de la nota" });
  await edit.fill("Llamó Ana: pasa a las 10");
  await edit.press("Control+Enter");
  await expect(entries(page).first()).toContainText("Llamó Ana: pasa a las 10");

  await page.reload();
  await expect(entries(page).first()).toContainText("Llamó Ana: pasa a las 10");

  await entries(page).first().getByRole("button", { name: "Eliminar" }).click();
  await entries(page).first().getByRole("button", { name: "¿Eliminar?" }).click();
  await expect(entries(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(tasks.card("Llamada").getByRole("img", { name: /nota/ })).toHaveCount(0);
});

test("the card back takes pasted pictures and dropped files anywhere on it", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Fotos de obra", list: "en_curso" }]);
  await tasks.open();
  await tasks.card("Fotos de obra").click();

  const png = { name: "foto.png", type: "image/png", body: "not really a png" };
  await paste(page, { file: png });
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first().getByRole("link", { name: "foto.png" })).toBeVisible();

  await dropOn(back(page), { file: { name: "plano.pdf", type: "application/pdf", body: "%PDF" } });
  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).first()).toContainText("plano.pdf");
});

test("a card's file is not served outside its workspace", async ({ page, tasks }) => {
  const [card] = await tasks.seed([{ title: "Privado", list: "en_curso" }]);
  const note = await (
    await page.request.post(`/api/cards/${card!.id}/notes/files`, {
      multipart: { file: { name: "secreto.txt", mimeType: "text/plain", buffer: Buffer.from("x") } },
    })
  ).json();
  expect((await page.request.get(note.file.url)).status()).toBe(200);

  await page.context().clearCookies();
  expect((await page.request.get(note.file.url)).status()).not.toBe(200);
});
