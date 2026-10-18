import { describe, expect, it } from "vitest";

import { toPublicIndustry, toPublicProgram, toPublicWorkshopLink } from "@/features/showcase/public";

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

describe("toPublicProgram", () => {
  const program = {
    id: "p1",
    slug: "leadership",
    title: "Leadership Training & Development",
    summary: "For new managers.",
    usefulFor: ["New and first-time managers"]
  };
  const image = {
    key: "programs/leadership.jpg",
    alt: "Managers in a session",
    width: 1400,
    height: 800
  };
  const toUrl = (key: string) => `https://cdn.example.com/${key}`;

  it("returns only public fields", () => {
    expect(toPublicProgram({ program, image }, toUrl)).toEqual({
      id: "p1",
      slug: "leadership",
      title: "Leadership Training & Development",
      summary: "For new managers.",
      image: {
        url: "https://cdn.example.com/programs/leadership.jpg",
        alt: "Managers in a session",
        width: 1400,
        height: 800
      },
      usefulFor: ["New and first-time managers"]
    });
  });

  it("returns a null image when the image is archived", () => {
    expect(toPublicProgram({ program, image: null }, toUrl).image).toBeNull();
  });
});
