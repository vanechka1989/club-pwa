import { describe, expect, it } from "vitest";
import { applyAvatarGesture } from "./avatarGesture";

describe("avatar gesture editor", () => {
  it("moves the crop opposite to a single-finger drag", () => {
    const result = applyAvatarGesture({
      startPositionX: 50,
      startPositionY: 50,
      startScale: 1,
      startCenterX: 100,
      startCenterY: 100,
      currentCenterX: 140,
      currentCenterY: 80,
      previewWidth: 200,
      previewHeight: 200
    });

    expect(result).toEqual({
      positionX: 30,
      positionY: 60,
      scale: 1
    });
  });

  it("zooms around the gesture distance while keeping position clamped", () => {
    const result = applyAvatarGesture({
      startPositionX: 5,
      startPositionY: 95,
      startScale: 1.2,
      startCenterX: 100,
      startCenterY: 100,
      currentCenterX: 60,
      currentCenterY: 150,
      startDistance: 80,
      currentDistance: 160,
      previewWidth: 200,
      previewHeight: 200
    });

    expect(result.positionX).toBe(13);
    expect(result.positionY).toBe(85);
    expect(result.scale).toBe(2.4);
  });

  it("clamps crop scale and position to supported avatar display bounds", () => {
    const result = applyAvatarGesture({
      startPositionX: 50,
      startPositionY: 50,
      startScale: 2,
      startCenterX: 0,
      startCenterY: 0,
      currentCenterX: -1000,
      currentCenterY: 1000,
      startDistance: 20,
      currentDistance: 200,
      previewWidth: 100,
      previewHeight: 100
    });

    expect(result).toEqual({
      positionX: 100,
      positionY: 0,
      scale: 2.5
    });
  });
});
