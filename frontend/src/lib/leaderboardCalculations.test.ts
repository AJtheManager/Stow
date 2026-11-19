import { describe, expect, it } from "vitest";
import {
  ALL_REGIONS,
  ANONYMOUS_NAME,
  availableRegions,
  describeRankChange,
  findCurrentUser,
  nearbyCompetitors,
  rankEntries,
  trophyForRank,
  withRankChanges,
  type LeaderboardEntry,
  type LeaderboardPrivacy,
} from "./leaderboardCalculations";

function entry(
  userId: string,
  totalSaved: number,
  extra: Partial<LeaderboardEntry> & {
    streak?: number;
    goalsCompleted?: number;
  } = {},
): LeaderboardEntry {
  const { streak = 0, goalsCompleted = 0, ...rest } = extra;
  return {
    userId,
    displayName: `User ${userId}`,
    region: "NG",
    privacy: "public",
    values: { totalSaved, streak, goalsCompleted },
    ...rest,
  };
}

const board = [
  entry("a", 500),
  entry("b", 900),
  entry("c", 100),
  entry("d", 700),
];

describe("rankEntries", () => {
  it("orders by value, highest first, with 1-based ranks", () => {
    const ranked = rankEntries(board, { type: "totalSaved" });

    expect(ranked.map(r => [r.userId, r.rank, r.value])).toEqual([
      ["b", 1, 900],
      ["d", 2, 700],
      ["a", 3, 500],
      ["c", 4, 100],
    ]);
  });

  it("ranks by the selected leaderboard type", () => {
    const entries = [
      entry("a", 100, { streak: 3, goalsCompleted: 9 }),
      entry("b", 200, { streak: 30, goalsCompleted: 1 }),
    ];

    expect(rankEntries(entries, { type: "totalSaved" })[0].userId).toBe("b");
    expect(rankEntries(entries, { type: "streak" })[0].userId).toBe("b");
    expect(rankEntries(entries, { type: "goalsCompleted" })[0].userId).toBe("a");
  });

  it("gives equal values the same rank and skips the next (1, 2, 2, 4)", () => {
    const ranked = rankEntries(
      [entry("a", 300), entry("b", 200), entry("c", 200), entry("d", 100)],
      { type: "totalSaved" },
    );

    expect(ranked.map(r => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("breaks ties by user id so the order is stable", () => {
    const one = rankEntries([entry("z", 5), entry("a", 5)], { type: "totalSaved" });
    const two = rankEntries([entry("a", 5), entry("z", 5)], { type: "totalSaved" });

    expect(one.map(r => r.userId)).toEqual(["a", "z"]);
    expect(two.map(r => r.userId)).toEqual(["a", "z"]);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(board));
    rankEntries(board, { type: "totalSaved" });
    expect(board).toEqual(copy);
  });

  it("returns an empty list for no entries", () => {
    expect(rankEntries([], { type: "totalSaved" })).toEqual([]);
  });

  it("treats missing, negative and non-finite values as zero", () => {
    const entries = [
      entry("a", 10),
      entry("b", -5),
      entry("c", Number.NaN),
      { ...entry("d", 0), values: {} as LeaderboardEntry["values"] },
    ];

    const ranked = rankEntries(entries, { type: "totalSaved" });

    expect(ranked[0]).toMatchObject({ userId: "a", rank: 1, value: 10 });
    expect(ranked.slice(1).every(r => r.value === 0 && r.rank === 2)).toBe(true);
  });

  describe("region filter", () => {
    const regional = [
      entry("a", 500, { region: "NG" }),
      entry("b", 900, { region: "KE" }),
      entry("c", 700, { region: "NG" }),
    ];

    it("keeps only the chosen region and re-ranks within it", () => {
      const ranked = rankEntries(regional, { type: "totalSaved", region: "NG" });

      expect(ranked.map(r => [r.userId, r.rank])).toEqual([
        ["c", 1],
        ["a", 2],
      ]);
    });

    it("shows everyone for the all-regions filter", () => {
      expect(
        rankEntries(regional, { type: "totalSaved", region: ALL_REGIONS }),
      ).toHaveLength(3);
    });

    it("returns nothing for a region with no entries", () => {
      expect(rankEntries(regional, { type: "totalSaved", region: "JP" })).toEqual(
        [],
      );
    });
  });

  describe("privacy", () => {
    const withHidden = [
      entry("a", 900),
      entry("hidden", 800, { privacy: "hidden" }),
      entry("b", 700),
    ];

    it("drops opted-out users entirely", () => {
      const ranked = rankEntries(withHidden, { type: "totalSaved" });

      expect(ranked.map(r => r.userId)).toEqual(["a", "b"]);
    });

    it("keeps ranks contiguous so a hidden user cannot be inferred from a gap", () => {
      const ranked = rankEntries(withHidden, { type: "totalSaved" });

      expect(ranked.map(r => r.rank)).toEqual([1, 2]);
    });

    it("hides a user even when they are the viewer", () => {
      const ranked = rankEntries(withHidden, {
        type: "totalSaved",
        currentUserId: "hidden",
      });

      expect(findCurrentUser(ranked, "hidden")).toBeNull();
    });

    it("masks anonymous users' names but still ranks them", () => {
      const ranked = rankEntries(
        [entry("a", 900, { privacy: "anonymous", displayName: "Secret Name" })],
        { type: "totalSaved" },
      );

      expect(ranked[0].displayName).toBe(ANONYMOUS_NAME);
      expect(ranked[0].rank).toBe(1);
      expect(JSON.stringify(ranked)).not.toContain("Secret Name");
    });

    it("keeps the viewer's own anonymous row identified", () => {
      const ranked = rankEntries(
        [entry("me", 900, { privacy: "anonymous", displayName: "Me Myself" })],
        { type: "totalSaved", currentUserId: "me" },
      );

      expect(ranked[0].displayName).toBe("Me Myself");
      expect(ranked[0].isCurrentUser).toBe(true);
    });

    it.each<LeaderboardPrivacy>(["public", "anonymous"])(
      "includes %s users",
      privacy => {
        expect(
          rankEntries([entry("a", 1, { privacy })], { type: "totalSaved" }),
        ).toHaveLength(1);
      },
    );
  });
});

describe("trophies", () => {
  it("awards gold, silver and bronze to ranks 1-3", () => {
    expect(trophyForRank(1, 10)).toBe("gold");
    expect(trophyForRank(2, 10)).toBe("silver");
    expect(trophyForRank(3, 10)).toBe("bronze");
    expect(trophyForRank(4, 10)).toBeNull();
  });

  it("awards nothing for a zero value, even at rank 1", () => {
    expect(trophyForRank(1, 0)).toBeNull();
  });

  it("is applied to ranked entries", () => {
    const ranked = rankEntries(board, { type: "totalSaved" });

    expect(ranked.map(r => r.trophy)).toEqual(["gold", "silver", "bronze", null]);
  });

  it("gives tied users the same trophy", () => {
    const ranked = rankEntries(
      [entry("a", 300), entry("b", 200), entry("c", 200), entry("d", 100)],
      { type: "totalSaved" },
    );

    expect(ranked.map(r => r.trophy)).toEqual(["gold", "silver", "silver", null]);
  });

  it("does not award trophies when nobody has saved anything", () => {
    const ranked = rankEntries([entry("a", 0), entry("b", 0)], {
      type: "totalSaved",
    });

    expect(ranked.every(r => r.trophy === null)).toBe(true);
  });
});

describe("withRankChanges", () => {
  const before = rankEntries(board, { type: "totalSaved" });

  it("reports null when there is nothing to compare with", () => {
    const changes = withRankChanges(before, null).map(r => r.rankChange);

    expect(changes.every(change => change === null)).toBe(true);
  });

  it("reports 0 when nothing moved", () => {
    const changes = withRankChanges(before, before).map(r => r.rankChange);

    expect(changes).toEqual([0, 0, 0, 0]);
  });

  it("is positive for users who moved up and negative for those who moved down", () => {
    const after = rankEntries(
      board.map(e => (e.userId === "c" ? entry("c", 1000) : e)),
      { type: "totalSaved" },
    );

    const byUser = Object.fromEntries(
      withRankChanges(after, before).map(r => [r.userId, r.rankChange]),
    );

    expect(byUser).toEqual({ c: 3, b: -1, d: -1, a: -1 });
  });

  it("reports null for a user who was not on the previous board", () => {
    const after = rankEntries([...board, entry("new", 50)], {
      type: "totalSaved",
    });

    const changes = withRankChanges(after, before);

    expect(changes.find(r => r.userId === "new")?.rankChange).toBeNull();
  });

  it("does not mutate the ranked entries it is given", () => {
    const current = rankEntries(board, { type: "totalSaved" });
    withRankChanges(current, before);

    expect(current.every(r => r.rankChange === null)).toBe(true);
  });
});

describe("nearbyCompetitors", () => {
  const ranked = rankEntries(
    Array.from({ length: 10 }, (_, i) => entry(`u${i}`, 1000 - i * 10)),
    { type: "totalSaved" },
  );

  it("returns the viewer plus two users above and two below by default", () => {
    expect(nearbyCompetitors(ranked, "u5").map(r => r.userId)).toEqual([
      "u3",
      "u4",
      "u5",
      "u6",
      "u7",
    ]);
  });

  it("shortens the window at the top of the board", () => {
    expect(nearbyCompetitors(ranked, "u0").map(r => r.userId)).toEqual([
      "u0",
      "u1",
      "u2",
    ]);
  });

  it("shortens the window at the bottom of the board", () => {
    expect(nearbyCompetitors(ranked, "u9").map(r => r.userId)).toEqual([
      "u7",
      "u8",
      "u9",
    ]);
  });

  it("honours a custom radius, including 0", () => {
    expect(nearbyCompetitors(ranked, "u5", 1)).toHaveLength(3);
    expect(nearbyCompetitors(ranked, "u5", 0).map(r => r.userId)).toEqual(["u5"]);
  });

  it("returns nothing when the viewer is not on the board", () => {
    expect(nearbyCompetitors(ranked, "ghost")).toEqual([]);
    expect(nearbyCompetitors(ranked, null)).toEqual([]);
    expect(nearbyCompetitors([], "u5")).toEqual([]);
  });

  it("returns nothing for a negative radius", () => {
    expect(nearbyCompetitors(ranked, "u5", -1)).toEqual([]);
  });
});

describe("findCurrentUser", () => {
  const ranked = rankEntries(board, { type: "totalSaved", currentUserId: "a" });

  it("finds the viewer's row", () => {
    expect(findCurrentUser(ranked, "a")).toMatchObject({
      userId: "a",
      rank: 3,
      isCurrentUser: true,
    });
  });

  it("returns null for an unknown or missing viewer", () => {
    expect(findCurrentUser(ranked, "nobody")).toBeNull();
    expect(findCurrentUser(ranked, undefined)).toBeNull();
  });
});

describe("availableRegions", () => {
  it("lists each region once, sorted", () => {
    const regions = availableRegions([
      entry("a", 1, { region: "NG" }),
      entry("b", 1, { region: "KE" }),
      entry("c", 1, { region: "NG" }),
    ]);

    expect(regions).toEqual(["KE", "NG"]);
  });

  it("does not reveal the region of a hidden user", () => {
    const regions = availableRegions([
      entry("a", 1, { region: "NG" }),
      entry("b", 1, { region: "JP", privacy: "hidden" }),
    ]);

    expect(regions).toEqual(["NG"]);
  });

  it("ignores empty regions", () => {
    expect(availableRegions([entry("a", 1, { region: "" })])).toEqual([]);
  });
});

describe("describeRankChange", () => {
  it("describes each kind of movement", () => {
    expect(describeRankChange(2)).toBe("Up 2");
    expect(describeRankChange(-1)).toBe("Down 1");
    expect(describeRankChange(0)).toBe("No change");
    expect(describeRankChange(null)).toBe("New");
  });
});
