import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: { findUnique: vi.fn() },
  project: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock, prisma: prismaMock }));
vi.mock("@clerk/nextjs/server", () => ({ verifyToken: vi.fn() }));

import { ApiError, requireOrgRole, requirePlatformAdmin, requireProject } from "@/lib/auth";

function memberWithRole(role: string | null) {
  prismaMock.organizationMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => vi.resetAllMocks());

describe("requireOrgRole", () => {
  it("allows a member at or above the minimum role", async () => {
    memberWithRole("admin");
    await expect(requireOrgRole("u", "o", "developer")).resolves.toBeUndefined();
  });

  it("rejects a member below the minimum role", async () => {
    memberWithRole("viewer");
    await expect(requireOrgRole("u", "o", "developer")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects non-members", async () => {
    memberWithRole(null);
    await expect(requireOrgRole("u", "o")).rejects.toMatchObject({ status: 403 });
  });

  // Regression: an array used to be looked up as a key, fall back to rank 0,
  // and let viewers through on write endpoints.
  it("enforces an array of roles instead of ignoring it", async () => {
    memberWithRole("viewer");
    await expect(requireOrgRole("u", "o", ["owner", "admin", "developer"])).rejects.toMatchObject({
      status: 403,
    });
  });

  it("lets any listed role (or higher) through when given an array", async () => {
    memberWithRole("developer");
    await expect(requireOrgRole("u", "o", ["owner", "admin", "developer"])).resolves.toBeUndefined();
  });

  it("denies access for an unknown role name rather than granting it", async () => {
    memberWithRole("owner");
    await expect(requireOrgRole("u", "o", "superuser")).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireProject", () => {
  it("looks the project up scoped to the org", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: "p" });
    await requireProject("org-a", "p");
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({ where: { id: "p", orgId: "org-a" } });
  });

  it("404s when the project belongs to another org", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    await expect(requireProject("org-a", "p-of-org-b")).rejects.toBeInstanceOf(ApiError);
    await expect(requireProject("org-a", "p-of-org-b")).rejects.toMatchObject({ status: 404 });
  });
});

describe("requirePlatformAdmin", () => {
  it("allows role=admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "admin" });
    await expect(requirePlatformAdmin("u")).resolves.toBeUndefined();
  });

  it("rejects ordinary users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "user" });
    await expect(requirePlatformAdmin("u")).rejects.toMatchObject({ status: 403 });
  });
});
