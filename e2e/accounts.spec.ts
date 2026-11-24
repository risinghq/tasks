import { chooseFromMenu, expect, signInAs, test } from "./fixtures";

test("an owner adds a member, who sees the shared board and keeps a personal one", async ({
  page,
  browser,
  tasks,
}, testInfo) => {
  await tasks.seed([{ title: "Del propietario", list: "en_curso" }]);
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
  await expect(members.getByRole("alert")).toHaveText("Ese correo ya está en este espacio.");

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

  // Their own board starts empty.
  await expect(theirs.getByRole("heading", { name: "Tareas" })).toBeVisible();
  await expect(theirs.locator("[data-card-id]")).toHaveCount(0);

  // The owner's board is one menu item away, and its owner's name tells it apart.
  await chooseFromMenu(theirs, "Dev", "menuitemradio");
  await expect(theirs.locator("[data-card-id]", { hasText: "Del propietario" })).toBeVisible();

  await chooseFromMenu(theirs, "Ajustes");
  const theirSettings = theirs.getByRole("dialog", { name: "Ajustes" });
  const theirMembers = theirSettings.getByRole("region", { name: "Miembros" });
  await expect(theirMembers.getByLabel("Correo de Google del miembro")).toHaveCount(0);
  await expect(theirMembers.getByRole("button", { name: "Salir del espacio" })).toBeVisible();

  await guest.close();
});

test("a user makes a workspace for a company and its board is separate", async ({ page, tasks }) => {
  await tasks.seed([{ title: "Personal", list: "en_curso" }]);
  await tasks.open();

  await chooseFromMenu(page, "Espacio nuevo");
  const dialog = page.getByRole("dialog", { name: "Espacio nuevo" });
  await dialog.getByLabel("Nombre").fill("Empresa A");
  await dialog.getByRole("button", { name: "Crear espacio" }).click();

  // Switching reloads the page. Wait for the new menu before the next step.
  const menu = page.locator("header [aria-haspopup='menu']");
  await expect(menu).toContainText("Empresa A");
  await expect(page.locator("[data-card-id]")).toHaveCount(0);

  // Back to the personal one.
  await chooseFromMenu(page, "Personal", "menuitemradio");
  await expect(menu).not.toContainText("Empresa A");
  await expect(tasks.card("Personal")).toBeVisible();

  // Clean up so the next run starts from the same state.
  await chooseFromMenu(page, "Empresa A", "menuitemradio");
  await expect(menu).toContainText("Empresa A");
  await chooseFromMenu(page, "Ajustes");
  const settings = page.getByRole("dialog", { name: "Ajustes" });
  await settings.getByRole("button", { name: "Borrar espacio" }).click();
  await settings.getByRole("button", { name: "Sí, borrar" }).click();
  await expect(menu).not.toContainText("Empresa A");
});

test("the login page offers Google", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: "es-PE" });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute(
    "href",
    "/auth/google",
  );
  await context.close();
});
