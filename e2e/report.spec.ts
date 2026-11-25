import type { ReportLink, WorkspaceSettings } from "../src/shared/model";
import { expect, test } from "./fixtures";

const WORD = "supercalifragilisticoespialidosoyconstantinopolitanoestremaduro";

test.describe("the report never scrolls sideways", () => {
  test.beforeEach(async ({ page, tasks }) => {
    await tasks.seed([
      {
        title: `${WORD} entregado esta semana`,
        list: "hecho",
        description: `${WORD}\nsegunda línea`,
        label: { name: "Empresa A con un nombre largo", color: "blue" },
      },
      {
        title: "Trabajo en curso con un nombre muy largo que sigue y sigue sin terminar jamás",
        list: "en_curso",
        requester: "Augusto",
        label: { name: "Empresa A con un nombre largo", color: "blue" },
        checklist: [
          { text: "Uno", done: true },
          { text: "Dos", done: false },
        ],
      },
      { title: "Lo que viene", list: "esta_semana", label: { name: "Clientes", color: "green" } },
    ]);
    const empresa = (await tasks.board()).labels.find((l) => l.name === "Empresa A con un nombre largo")!;
    await page.request.post("/api/report-links", { data: { labelId: empresa.id } });
  });

  for (const width of [320, 390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`at ${width}px in ${colorScheme}`, async ({ page }) => {
        const settings = (await (await page.request.get("/api/workspace")).json()) as WorkspaceSettings;
        const links = (await (await page.request.get("/api/report-links")).json()) as ReportLink[];
        const scoped = links.find((l) => l.label !== null)!;

        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ colorScheme });
        for (const path of [`/r/${settings.reportToken}`, `/r/${scoped.token}`]) {
          await page.goto(path);
          const overflow = await page.evaluate<number>(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth",
          );
          expect(overflow, `${path} overflows at ${width}px ${colorScheme}`).toBeLessThanOrEqual(0);
        }
      });
    }
  }
});
