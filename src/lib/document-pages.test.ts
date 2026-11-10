import { describe, expect, it } from "vitest";
import { isDocumentPage } from "./document-pages";

describe("isDocumentPage", () => {
  it("matches the pages opened from outside the app", () => {
    for (const p of ["/privacy", "/terms", "/faq", "/delete-account", "/privacy/"]) {
      expect(isDocumentPage(p), p).toBe(true);
    }
  });

  it("leaves the app and the lobby alone", () => {
    for (const p of ["/", "/launch", "/login", "/wardrobe", "/profile/settings/privacy", "/privacy-policy", "/termsandmore"]) {
      expect(isDocumentPage(p), p).toBe(false);
    }
  });
});
