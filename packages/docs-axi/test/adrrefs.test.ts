import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adrInfos, checkRefs, findBareRefs, findRefs, resolveRef } from "../src/adrrefs.js";
import { tempRepo } from "./helpers.js";

const adrs = [{ number: 12, slug: "some-decision", path: "decisions/0012-some-decision.md" }];

describe("adrrefs", () => {
  it("resolves a valid ref", () => {
    const [r] = findRefs("See ADR-0012-some-decision for why.");
    expect(r?.number).toBe(12);
    expect(resolveRef(r!, adrs).ok).toBe(true);
    expect(checkRefs("See ADR-0012-some-decision.", adrs)).toEqual([]);
  });

  it("fails wrong slug and wrong number", () => {
    const slug = checkRefs("ADR-0012-other-thing", adrs);
    expect(slug[0]?.code).toBe("ADR_REF_UNKNOWN");
    expect(slug[0]?.detail).toContain("ADR-0012-some-decision");
    const num = checkRefs("ADR-0013-some-decision", adrs);
    expect(num[0]?.code).toBe("ADR_REF_UNKNOWN");
  });

  it("flags bare forms", () => {
    expect(findBareRefs("ADR 7, ADR 0007, ADR-7 and ADR-0007.")).toEqual(["ADR 7", "ADR 0007", "ADR-7", "ADR-0007"]);
    expect(findBareRefs("ADR-0012-some-decision")).toEqual([]);
    expect(checkRefs("see ADR 7", adrs)[0]?.code).toBe("ADR_REF_BARE");
  });

  it("ignores code fences and inline code", () => {
    const text = "```\nADR 7 ADR-0099-x\n```\nuse `ADR 7` and `ADR-0099-x`";
    expect(checkRefs(text, adrs)).toEqual([]);
  });

  describe("qualified refs and source repos", () => {
    const multi = [
      { number: 9, slug: "shared", path: "decisions/0009-shared.md" },
      { number: 9, slug: "shared", path: "decisions/0009-shared.md", repo: "app" },
      { number: 9, slug: "app-only", path: "decisions/0009-app-only.md", repo: "app" },
      { number: 4, slug: "other", path: "decisions/0004-other.md", repo: "lib" },
    ];
    it("resolves an ADR that exists only in a source repo", () => {
      expect(checkRefs("ADR-0004-other", multi)).toEqual([]);
      expect(checkRefs("ADR-0004-wrong", multi)[0]?.code).toBe("ADR_REF_UNKNOWN");
    });
    it("skips qualified refs unless asked, so docs tools leave them alone", () => {
      expect(findRefs("see app:ADR-0009-app-only")).toEqual([]);
      expect(checkRefs("see app:ADR-0009-app-only", [])).toEqual([]);
      expect(findRefs("see app:ADR-0009-app-only", { qualified: true })[0]).toMatchObject({ repo: "app", number: 9, token: "app:ADR-0009-app-only" });
    });
    it("resolves a qualified ref only inside that repo", () => {
      expect(checkRefs("app:ADR-0009-app-only", multi, { qualified: true })).toEqual([]);
      expect(checkRefs("lib:ADR-0009-app-only", multi, { qualified: true })[0]?.code).toBe("ADR_REF_UNKNOWN");
      expect(checkRefs("app:ADR-0009-wrong", multi, { qualified: true })[0]?.detail).toContain("app:ADR-0009-shared");
    });
    it("reports an unqualified ref found in two repos as ambiguous", () => {
      const p = checkRefs("ADR-0009-shared", multi, { qualified: true });
      expect(p[0]?.code).toBe("ADR_REF_AMBIGUOUS");
      expect(p[0]?.detail).toContain("app:ADR-0009-shared");
      expect(checkRefs("app:ADR-0009-shared", multi, { qualified: true })).toEqual([]);
    });
  });

  it("builds infos from docs", () => {
    expect(adrInfos([{ adrNumber: 12, slug: "0012-some-decision", path: "p" } as never])).toEqual([
      { number: 12, slug: "some-decision", path: "p" },
    ]);
  });
});

describe("docs-axi check ADR refs", () => {
  let repo: ReturnType<typeof tempRepo>;
  beforeEach(async () => {
    repo = tempRepo();
    await repo.run("init");
    await repo.run("adr", "add", "Use Redis cache", "--summary", "Cache with redis", "--decision", "We use Redis.");
  });
  afterEach(() => repo.cleanup());

  it("reports unresolved and bare refs", async () => {
    await repo.run("new", "domain", "Notes", "--summary", "Notes", "--body", "See ADR 1 and ADR-0001-wrong-slug.");
    const r = await repo.run("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("ADR_REF_BARE");
    expect(r.out).toContain("ADR_REF_UNKNOWN");
  });
});
