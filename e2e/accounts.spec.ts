import { chooseFromMenu, expect, signInAs, test } from "./fixtures";

test("an admin adds a member, who gets a board of their own and no Miembros section", async ({
  page,
  browser,
  tasks,
}, testInfo) => {
  await tasks.seed([{ title: "Del admin", list: "en_curso" }]);
  await tasks.open();

  await chooseFromMenu(page, "Ajustes");
  const settings = page.getByRole("dialog", { name: "Ajustes" });
  const members = settings.getByRole("region", { name: "Miembros" });
  const email = `ana-${Date.now()}@tasks.test`;
  await members.getByLabel("Correo de Google del miembro").fill(email);
  await members.getByRole("button", { name: "Añadir" }).click();
  await expect(members.getByRole("listitem").filter({ hasText: email })).toBeVisible();

  // Adding the same email again says so.
  await members.getByLabel("Correo de Google del miembro").fill(email);
  await members.getByRole("button", { name: "Añadir" }).click();
  await expect(members.getByRole("alert")).toHaveText("Ese correo ya tiene una cuenta.");

  // The member is another person in another browser. Their Google sign-in is
  // replaced by a forged cookie.
  const id = (
    (await (await page.request.get("/api/members")).json()) as { id: string; email: string }[]
  ).find((member) => member.email === email)!.id;
  const guest = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: "es-PE",
    timezoneId: "America/Lima",
  });
  const theirs = await guest.newPage();
  await signInAs(theirs, id);
  await theirs.goto("/");

  await expect(theirs.getByRole("heading", { name: "Tareas" })).toBeVisible();
  await expect(theirs.locator("[data-card-id]")).toHaveCount(0);
  const active = theirs.getByRole("region", { name: "En curso", exact: true });
  await active.getByRole("button", { name: "Añade una tarjeta" }).click();
  await active.getByRole("textbox", { name: "Título de la tarjeta" }).fill("De Ana");
  await theirs.keyboard.press("Enter");
  await expect(active.locator("[data-card-id]")).toHaveText(["De Ana"]);
  await expect.poll(async () => (await (await theirs.request.get("/api/board")).json()).cards.length).toBe(1);

  // The admin's board shows only their own card, also after a reload.
  await page.reload();
  await tasks.open();
  await expect(tasks.card("Del admin")).toBeVisible();
  await expect(page.locator("[data-card-id]")).toHaveCount(1);
  await expect(tasks.card("De Ana")).toHaveCount(0);

  await chooseFromMenu(theirs, "Ajustes");
  const own = theirs.getByRole("dialog", { name: "Ajustes" });
  await expect(own.getByRole("heading", { name: "Cuenta" })).toBeVisible();
  await expect(own.getByRole("region", { name: "Miembros" })).toHaveCount(0);

  await guest.close();
});

test("the login page offers Google", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: "es-PE" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute(
    "href",
    "/auth/google",
  );
  await context.close();
});
