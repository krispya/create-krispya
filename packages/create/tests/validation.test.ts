import { describe, it, expect } from "vitest";
import { validatePackageName } from "../src/utils.js";

describe("validatePackageName", () => {
  describe("valid names", () => {
    it("accepts lowercase alphanumeric names", () => {
      expect(validatePackageName("my-app")).toBeUndefined();
      expect(validatePackageName("app123")).toBeUndefined();
      expect(validatePackageName("a")).toBeUndefined();
      expect(validatePackageName("my-cool-app")).toBeUndefined();
    });

    it("accepts numbers in names", () => {
      expect(validatePackageName("app1")).toBeUndefined();
      expect(validatePackageName("123")).toBeUndefined();
      expect(validatePackageName("v2-api")).toBeUndefined();
    });
  });

  describe("empty names", () => {
    it("rejects empty string", () => {
      expect(validatePackageName("")).toBe("Package name is required");
    });
  });

  describe("path traversal", () => {
    it("rejects names with ..", () => {
      expect(validatePackageName("..")).toBe(
        "Package name cannot contain path separators or '..'"
      );
      expect(validatePackageName("../foo")).toBe(
        "Package name cannot contain path separators or '..'"
      );
      expect(validatePackageName("foo/../bar")).toBe(
        "Package name cannot contain path separators or '..'"
      );
    });

    it("rejects names with forward slashes", () => {
      expect(validatePackageName("foo/bar")).toBe(
        "Package name cannot contain path separators or '..'"
      );
    });

    it("rejects names with backslashes", () => {
      expect(validatePackageName("foo\\bar")).toBe(
        "Package name cannot contain path separators or '..'"
      );
    });
  });

  describe("invalid characters", () => {
    it("rejects uppercase letters", () => {
      expect(validatePackageName("MyApp")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
      expect(validatePackageName("APP")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
    });

    it("rejects spaces", () => {
      expect(validatePackageName("my app")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
    });

    it("rejects special characters", () => {
      expect(validatePackageName("my_app")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
      expect(validatePackageName("my@app")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
      expect(validatePackageName("my.app")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
      expect(validatePackageName("my!app")).toBe(
        "Package name must be lowercase and contain only letters, numbers, and hyphens"
      );
    });
  });

  describe("hyphen rules", () => {
    it("rejects names starting with hyphen", () => {
      expect(validatePackageName("-app")).toBe(
        "Package name cannot start or end with a hyphen"
      );
    });

    it("rejects names ending with hyphen", () => {
      expect(validatePackageName("app-")).toBe(
        "Package name cannot start or end with a hyphen"
      );
    });

    it("rejects consecutive hyphens", () => {
      expect(validatePackageName("my--app")).toBe(
        "Package name cannot contain consecutive hyphens"
      );
    });
  });
});
