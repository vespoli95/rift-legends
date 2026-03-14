import { describe, it, expect } from "vitest";
import { sortByRole } from "./utils";

describe("sortByRole", () => {
  it("sorts participants in role order: Top, Jungle, Mid, Bot, Support", () => {
    const participants = [
      { teamPosition: "UTILITY", name: "support" },
      { teamPosition: "BOTTOM", name: "bot" },
      { teamPosition: "TOP", name: "top" },
      { teamPosition: "MIDDLE", name: "mid" },
      { teamPosition: "JUNGLE", name: "jungle" },
    ];

    const sorted = sortByRole(participants);

    expect(sorted.map((p) => p.teamPosition)).toEqual([
      "TOP",
      "JUNGLE",
      "MIDDLE",
      "BOTTOM",
      "UTILITY",
    ]);
  });

  it("does not mutate the original array", () => {
    const participants = [
      { teamPosition: "UTILITY" },
      { teamPosition: "TOP" },
    ];
    const original = [...participants];

    sortByRole(participants);

    expect(participants).toEqual(original);
  });

  it("puts unknown or missing roles at the end", () => {
    const participants = [
      { teamPosition: "TOP" },
      { teamPosition: undefined },
      { teamPosition: "JUNGLE" },
      { teamPosition: "INVALID" },
    ];

    const sorted = sortByRole(participants);

    expect(sorted.map((p) => p.teamPosition)).toEqual([
      "TOP",
      "JUNGLE",
      undefined,
      "INVALID",
    ]);
  });
});
