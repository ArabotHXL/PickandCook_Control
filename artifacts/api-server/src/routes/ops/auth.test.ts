import { describe, it, expect } from "vitest";
import { ADMIN_ROLES_READ, ADMIN_ROLES_WRITE } from "./auth.js";

describe("admin role tiers", () => {
  it("read tier includes both admin and read_only_admin", () => {
    expect(ADMIN_ROLES_READ).toContain("admin");
    expect(ADMIN_ROLES_READ).toContain("read_only_admin");
  });

  it("write tier excludes read_only_admin", () => {
    expect(ADMIN_ROLES_WRITE).toContain("admin");
    expect(ADMIN_ROLES_WRITE).not.toContain("read_only_admin");
    expect(ADMIN_ROLES_WRITE).not.toContain("user");
  });

  it("read tier is a strict superset of write tier", () => {
    for (const w of ADMIN_ROLES_WRITE) {
      expect(ADMIN_ROLES_READ).toContain(w);
    }
  });
});
