import { beforeEach, describe, expect, it } from "vitest";
import {
  activatePortalTaskLayer,
  hasPortalTaskLayer,
  portalTaskLayerDepth,
  resetPortalTaskLayersForTests
} from "./taskLayerRegistry";

describe("portal task layer registry", () => {
  beforeEach(() => {
    resetPortalTaskLayersForTests();
    document.body.innerHTML = "";
  });

  it("keeps the application isolated until the last portal task layer closes", () => {
    const releaseFirst = activatePortalTaskLayer();
    const releaseSecond = activatePortalTaskLayer();

    expect(portalTaskLayerDepth.value).toBe(2);
    expect(hasPortalTaskLayer.value).toBe(true);

    releaseFirst();
    releaseFirst();
    expect(portalTaskLayerDepth.value).toBe(1);
    expect(hasPortalTaskLayer.value).toBe(true);

    releaseSecond();
    expect(portalTaskLayerDepth.value).toBe(0);
    expect(hasPortalTaskLayer.value).toBe(false);
  });

  it("blurs background input and focuses the task screen back button", () => {
    const backgroundInput = document.createElement("input");
    const layer = document.createElement("div");
    layer.className = "task-screen-route-layer";
    const backButton = document.createElement("button");
    backButton.className = "ui-page-header__back";
    layer.append(backButton);
    document.body.append(backgroundInput, layer);
    backgroundInput.focus();

    const release = activatePortalTaskLayer(layer);

    expect(document.activeElement).toBe(backButton);
    release();
  });
});
