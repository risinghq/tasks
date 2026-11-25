import type { ReportLink } from "../../src/shared/model";
import { expect, test } from "../fixtures";

/** Screenshots of the main screens at the review widths, written to shots/ for a person to look at. */
test.beforeEach(async ({ tasks }) => {
  await tasks.seed([
    { title: "Revisar el contrato de mantenimiento", list: "pendiente" },
    {
      title: "Preparar la propuesta para el cliente",
      list: "esta_semana",
      requester: "Augusto",
      label: { name: "Clientes", color: "green" },
    },
    {
      title: "Migrar los correos al nuevo dominio",
      list: "en_curso",
      description: "Primero los buzones compartidos.\nLuego los personales.",
      label: { name: "Empresa A", color: "blue" },
      checklist: [
        { text: "Buzones compartidos", done: true },
        { text: "Buzones personales", done: false },
      ],
    },
    { title: "Cerrar el informe mensual", list: "hecho", label: { name: "Empresa A", color: "blue" } },
  ]);
});

for (const width of [390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${width}px ${colorScheme}`, async ({ page, tasks }) => {
      const name = (screen: string) => `shots/${screen}-${width}-${colorScheme}.png`;
      const settle = () => page.evaluate("Promise.all(document.getAnimations().map((a) => a.finished))");
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme });

      await tasks.open();
      await page.screenshot({ path: name("board") });

      await tasks.card("Migrar los correos").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.mouse.move(0, 0);
      await settle();
      await page.screenshot({ path: name("card") });

      const [whole] = (await (await page.request.get("/api/report-links")).json()) as ReportLink[];
      await page.goto(`/r/${whole!.token}`);
      await page.screenshot({ path: name("report"), fullPage: true });
    });
  }
}
