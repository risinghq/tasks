import { describe, expect, it } from "vitest";
import { placeBeside } from "../src/web/placeBeside";

const viewport = { width: 1440, height: 800 };
const size = { width: 176, height: 260 };
const card = { left: 24, top: 120, right: 280, bottom: 220 };

describe("placeBeside", () => {
  it("puts the panel right of the card", () => {
    expect(placeBeside(card, 270, size, viewport)).toEqual({ left: 288, top: 120 });
  });

  it("puts it on the left when the right side is too narrow", () => {
    const last = { left: 1150, top: 120, right: 1406, bottom: 220 };
    expect(placeBeside(last, 270, size, viewport)).toEqual({ left: 966, top: 120 });
  });

  it("puts it under the card when neither side fits", () => {
    const wide = { left: 16, top: 120, right: 359, bottom: 220 };
    expect(placeBeside(wide, 270, size, { width: 375, height: 800 })).toEqual({ left: 16, top: 278 });
  });

  it("lifts it to stay inside the viewport", () => {
    const low = { left: 24, top: 700, right: 280, bottom: 780 };
    expect(placeBeside(low, 830, size, viewport)).toEqual({ left: 288, top: 532 });
  });
});
