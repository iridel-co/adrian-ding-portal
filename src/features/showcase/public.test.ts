import { describe, expect, it } from "vitest";

import { toPublicIndustry, toPublicWorkshopLink } from "@/features/showcase/public";

describe("toPublicIndustry", () => {
  it("returns the industry name and id", () => {
    expect(toPublicIndustry({ id: "t1", name: "Finance", archivedAt: null })).toEqual({
      id: "t1",
      name: "Finance"
    });
  });

  it("hides an archived industry or a missing one", () => {
    expect(toPublicIndustry({ id: "t1", name: "SMEs", archivedAt: new Date() })).toBeNull();
    expect(toPublicIndustry(null)).toBeNull();
  });
});

describe("toPublicWorkshopLink", () => {
  it("links to a published workshop", () => {
    const linked = { slug: "exceptional-salesmanship", title: "Exceptional Salesmanship" };
    expect(toPublicWorkshopLink({ ...linked, status: "published" })).toEqual(linked);
  });

  it("hides draft and archived workshops", () => {
    expect(toPublicWorkshopLink({ slug: "a", title: "A", status: "draft" })).toBeNull();
    expect(toPublicWorkshopLink({ slug: "a", title: "A", status: "archived" })).toBeNull();
    expect(toPublicWorkshopLink(null)).toBeNull();
  });
});
