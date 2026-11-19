import { describe, expect, it } from "vitest";
import { APP_AUTH_RETURN, appAuthRedirect, appAuthReturnPath, appReturnIntent } from "./app-google-sign-in";

describe("appAuthRedirect", () => {
  it("returns to the site's own https page, carrying the page to open next", () => {
    expect(appAuthRedirect("https://linette.app", "/")).toBe("https://linette.app/auth/app-return?next=%2F");
    expect(appAuthRedirect("https://linette.app", "/wardrobe?x=1")).toBe(
      "https://linette.app/auth/app-return?next=%2Fwardrobe%3Fx%3D1",
    );
  });

  it("never returns to a custom scheme (any app could claim it)", () => {
    expect(appAuthRedirect("https://linette.app", "/")).not.toMatch(/^app\.linette:/);
  });
});

describe("appReturnIntent", () => {
  const fallback = "https://linette.app/login?error=app_return";

  it("hands the sign-in's own parameters to the app's package only", () => {
    const intent = appReturnIntent(new URLSearchParams("next=%2Fwardrobe&code=abc-123&utm=x"), fallback);
    expect(intent).toBe(
      "intent://auth/callback?code=abc-123&next=%2Fwardrobe#Intent;scheme=app.linette;package=app.linette;S.browser_fallback_url=https%3A%2F%2Flinette.app%2Flogin%3Ferror%3Dapp_return;end",
    );
  });

  it("carries a refusal on, and works with nothing to carry", () => {
    expect(appReturnIntent(new URLSearchParams("error=access_denied&error_description=denied"), fallback)).toMatch(
      /^intent:\/\/auth\/callback\?error=access_denied&error_description=denied#Intent;.*package=app\.linette;/,
    );
    expect(appReturnIntent(new URLSearchParams(""), fallback)).toMatch(/^intent:\/\/auth\/callback#Intent;scheme=app\.linette;package=app\.linette;/);
  });
});

describe("appAuthReturnPath", () => {
  it("sends a code to the site's own callback, with the page to open next", () => {
    expect(appAuthReturnPath(`${APP_AUTH_RETURN}?code=abc-123&next=%2Fwardrobe`)).toBe("/auth/callback?code=abc-123&next=%2Fwardrobe");
    expect(appAuthReturnPath(`${APP_AUTH_RETURN}?code=abc`)).toBe("/auth/callback?code=abc&next=%2F");
  });

  it("sends a refusal or a cancel back to the sign-in page", () => {
    expect(appAuthReturnPath(`${APP_AUTH_RETURN}?error=access_denied&error_description=The+user+denied`)).toBe(
      "/login?error=The%20user%20denied",
    );
    expect(appAuthReturnPath(`${APP_AUTH_RETURN}#error=server_error`)).toBe("/login?error=server_error");
    expect(appAuthReturnPath(APP_AUTH_RETURN)).toBe("/login?error=cancelled");
  });

  it("ignores every other link", () => {
    for (const link of [
      null,
      undefined,
      "",
      "not a link",
      "https://linette.app/auth/callback?code=abc",
      "app.linette://auth/elsewhere?code=abc",
      "app.linette://other/callback?code=abc",
      "evil.linette://auth/callback?code=abc",
    ]) {
      expect(appAuthReturnPath(link)).toBeNull();
    }
  });
});
