import { describe, expect, it } from "vitest";
import { getRegistryModelsConfig } from "@/app/api/providers/[id]/models/route.js";

describe("provider models listing", () => {
  it("uses a registry validateUrl when the provider declares one", () => {
    expect(getRegistryModelsConfig("sambanova")?.url).toBe(
      "https://api.sambanova.ai/v1/models",
    );
  });

  it("derives /models from an OpenAI chat transport", () => {
    expect(getRegistryModelsConfig("iflow")?.url).toBe(
      "https://apis.iflow.cn/v1/models",
    );
  });

  it("does not guess a models endpoint for non-standard transports", () => {
    expect(getRegistryModelsConfig("commandcode")).toBeNull();
    expect(getRegistryModelsConfig("grok-web")).toBeNull();
  });
});
