import { describe, expect, it } from "vitest";
import { buildStaticRulesBlock, stylingTipVoice } from "./suggest-prompt";

describe("stylingTipVoice", () => {
  it("asks French adjectives to agree with the wearer, and only in French", () => {
    expect(stylingTipVoice({ languageName: "French", wearer: "woman" })).toContain('"sûre de toi"');
    expect(stylingTipVoice({ languageName: "French", wearer: "man" })).toContain('"sûr de toi"');
    expect(stylingTipVoice({ languageName: "French", wearer: "man" })).not.toContain("sûre");
    expect(stylingTipVoice({ languageName: "French", wearer: "not-specified" })).toContain("don't change with gender");
    expect(stylingTipVoice({ languageName: "English", wearer: "man" })).not.toMatch(/Agree adjectives|change with gender/);
  });

  it("shows a tip for an empty step 2, so the model stops inventing a moment", () => {
    expect(stylingTipVoice({ languageName: "English" })).toContain("the second has none");
    expect(stylingTipVoice({ languageName: "English" })).toContain("Cuff the jeans once above the boots");
    expect(stylingTipVoice({ languageName: "French" })).toContain("à l'aise pour le brunch");
  });
});

describe("buildStaticRulesBlock", () => {
  it("carries the shared tip voice, with the track's wearer by default", () => {
    const men = buildStaticRulesBlock({ isMensTrack: true, languageName: "French" });
    expect(men).toContain(stylingTipVoice({ languageName: "French", wearer: "man" }));
    const unspecified = buildStaticRulesBlock({ isMensTrack: false, languageName: "French", wearer: "not-specified" });
    expect(unspecified).toContain("don't change with gender");
    expect(buildStaticRulesBlock({ isMensTrack: false, languageName: "English" })).toContain("RECENT TIPS");
  });
});
