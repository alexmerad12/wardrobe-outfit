# Styling Rules — Gap Analysis

Cross-reference of the **102 rules** in the [`fashion-styling-rules` skill](../../../.claude/skills/fashion-styling-rules/SKILL.md) against Closette's current styling logic. **Women-first priority**: the app serves women primarily, so recommendations are ordered with women-specific impact weighted highest.

## Status legend

- **present-consistent** — rule is in the app and agrees with external canon
- **present-contradicting** — rule is in the app but external canon disagrees
- **absent** — external canon has it; app doesn't
- **potential-revise** — app has it but looks arbitrary or unsupported

## Summary

| Status | General rules | Women-first rules | Total |
|--------|---------------|-------------------|-------|
| present-consistent | 8 | 0 | **8** |
| present-contradicting | 0 | 0 | **0** |
| absent | 54 | 38 | **92** |
| potential-revise | 2 | 0 | **2** |
| **Total** | **64** | **38** | **102** |

Closette is disciplined about the rules it DOES have (structural base, duplicate subcategory, at-home scarf) but is missing nearly all women-first styling knowledge: dress silhouette, women's formality tiers, women's shoe×occasion, neckline-jewelry pairing, hosiery, undergarments. Filling these is the largest ROI area for the app.

---

## Women-first gaps (all 38 absent)

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| **W1-W9 Dress silhouette × body-type** (A-line, sheath, wrap, slip, empire, mermaid, fit-and-flare, bodycon) | absent | `Subcategory` has mini-dress / midi-dress / maxi-dress but NO silhouette | **CRITICAL.** Add a `dress_silhouette` field to items; teach the `analyze` AI to infer it on upload. |
| W10 Black tie = floor-length gown | absent | `formal` occasion, no length constraint | Add prompt rule: for `formal`, prefer maxi dresses. |
| W11 Black-tie optional flexibility | absent | — | Low priority unless `Occasion` gets a tier. |
| **W12 Cocktail attire** = midi/knee, dressy fabric | absent | `dinner-out` / `party` / `date` | **High-impact.** For these evening occasions prefer dress length in mini/midi/knee + material in {silk, satin, chiffon, lace, velvet, sequined}. |
| W13 White tie = floor-length gown | absent | `Occasion` enum has no white-tie tier | Consider adding. |
| **W14 LBD cross-formality** | absent | — | Tag black + simple-cut dresses as versatile inventory. |
| **W15 Kitten heels office-to-evening** | absent | `heel_type` enum has `low-heel` | For `work` / `brunch` / `date` / `dinner-out`, bias heel_type = low-heel high. |
| W16 Kitten heel + structured bag | absent | — | Styling tip generator content. |
| **W17 Ballet flats scale across contexts** | absent | — | For `hangout` / `brunch` / casual work, ballet flats are a strong pick. |
| W18 Cocktail doesn't require heels | absent | — | Relaxes heel requirement for `dinner-out` / `date`. |
| **W19 V-neck → V pendant** | absent | `neckline` enum + necklace jewelry | Requires capturing necklace subcategory / chain length. Current schema has `jewelry` subcategory but no finer split. |
| **W20 Scoop → curve pendant** | absent | — | Same — needs necklace metadata. |
| W21 Turtleneck → long chain | absent | — | Same. |
| W22 Strapless → choker | absent | — | Same. |
| W23 Halter → mid-chest pendant / earrings | absent | — | Same. |
| W24 Sweetheart → short curved pendant | absent | — | Same. |
| W25-W29 Hosiery (denier, color, pattern, socks-with-heels) | absent | — | Requires adding a hosiery category; not in Closette today. |
| **W30 First-date waist-up focus** | absent | `date` occasion | Prompt-level: for `date`, bias top-piece detail / quality; accept simpler bottoms. |
| **W31 Cocktail wedding: no white / clutch / knee-tea length** | absent | — | High-value if user ever marks "wedding guest" context: reject white / ivory / cream / blush dresses. |
| **W32 Office default: sheath + blazer + pump** | absent | `work` occasion | Reinforce prompt: for `work`, prefer sheath dress + blazer + pointed-toe pump (low-mid heel). |
| W33 Bodycon at work: knee-length, neutral | absent | — | Post-parse: if outfit for `work` has bodycon silhouette, require knee-length + neutral. |
| W34-W38 Bra / underwear rules | absent | — | Needs undergarment category; out of scope for now. |

## Silhouette gaps (general)

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| S1 Rule of thirds (1/3–2/3 split) | absent | — | Add to styling intent or post-parse preference |
| S2 Break long silhouette with belt/tuck | absent | — | styling_tip generator trigger |
| **S3 One fitted + one loose** | absent | — | **High-impact.** Post-parse: reject outfits where every item shares `fit === "slim"` or all are `oversized`. |
| S4 Half-inch cuff reveal | absent | — | Low priority |
| S5 Shoulder:waist 1.618 | absent | — | Skip (menswear) |
| S6-S10 Women's body types (hourglass/pear/rectangle/apple/inverted-triangle) | absent | — | Future: add body-shape capture to user profile |
| S11 Trouser break | absent | — | Skip |
| S12 Ankle-grazer length | absent | `pants_length` enum | Low priority |
| **S13 Skirt length → shoe style** | absent | — | **High-impact.** Drive shoe-subcategory bias per skirt/dress length. |
| **S14 One focal point** | present-consistent | `suggest/route.ts` STYLING INTENT | Keep. |
| S15 Scale for petites | absent | — | Future: height capture |
| S16 Crop-top + high-waist | absent | — | Post-parse: crop-top present → bias `waist_height === "high"` bottom |
| S17 Long cardigan + slim bottom | absent | — | Nice styling_tip trigger |
| **S18 Third-piece vertical line** | present-consistent (weak) | removed "USE THE OUTERWEAR" | Reinforce lightly |

## Color gaps

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| **C1 60/30/10 color cap** | absent | — | **High-impact.** Post-parse count distinct non-neutral color families; reject ≥4. |
| C2 Anchor→accent build order | absent | — | Inform prompt phrasing |
| **C3-C7 Harmony types** | present-consistent | `color-engine.ts` | Keep |
| C8-C9 Undertones | absent | — | Future onboarding |
| C10 Warm/cool neutral split | potential-revise | `color-engine.ts` single `neutral` | Split into warm/cool neutrals |
| C11 Black + navy | absent | — | Consistent by omission |
| C12 All-neutral contrast | absent | — | Post-parse luminance check |
| C13-C14 Seasonal analysis | absent | — | Future onboarding |
| C15 Modern metal mixing | present-consistent | no forbidding rule | Keep |
| C16 Repeat each metal | absent | — | Post-parse check |
| C17-C18 Bold+neutral ratios | absent | — | Prompt template for `bold` mood |
| C19-C20 Pattern mixing | absent | — | Requires pattern-scale field |

## Occasion / formality gaps (general)

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| O1-O4 White-tie, black-tie, tuxedo tiers | absent | — | Optional `white-tie` / `black-tie` occasion tiers |
| O5-O6 Business formal / casual | absent | `work` | Prompt-level: prefer darker pieces, no denim, no athletic sneakers |
| O7 Smart casual | absent | `smart-casual` in Formality enum | Link to `dinner-out` / `date` |
| O8 Cocktail attire (general) | absent | — | Covered by W12 for women |
| **O9 Err upward on dress code** | absent | — | Prompt-level guidance |
| O10 Wedding time decoder | absent | — | Future: event-time capture |
| **O11 Elevated loungewear** | absent | `at-home` | Enrich prompt |
| O12 Travel capsule | absent | — | Relevant to packing engine |

## Weather / layering

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| **Wx1 Three-layer stack** | absent | — | **High-impact.** For <5°C, require 3 warmth tiers |
| Wx2 No cotton base | absent | — | Cold sport/outdoor only |
| Wx3 Synthetic > down when wet | absent | — | Edge case |
| **Wx4 Rain pillar** | present-consistent | `rain_appropriate` | Keep |
| Wx5 Layer roominess order | absent | — | styling_tip content |

## Footwear

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| **F1 Shoes ≤ trouser luminance** | absent | — | **High-impact.** For `work`/`formal`/`dinner-out`, shoe L ≤ bottom L |
| F2 Socks match trousers | absent | — | Skip (no sock items) |
| F3 Sneakers in business casual | absent | — | For `work`: sneakers only if leather/suede + neutral |
| F4 Office heel ≤ 3.5" | absent | `heel_type` | For `work`, bias low-heel / mid-heel / flat |

## Accessories

| Rule | Status | App location | Recommended action |
|------|--------|--------------|--------------------|
| **A1 Belt leather = shoe leather** | absent | — | **High-impact.** Belt + shoes color-family match |
| A2 Scarf scale to height | absent | — | Future: height capture |
| **A3 Bag size scales with formality** | absent | — | For `formal`/`party`/`date`: prefer clutch; for `work`: handbag/tote |
| A4 Remove brimmed hats indoors | absent | `at-home` | Mirror at-home-scarf rule for hats |
| A5 Warmth-only accessories off indoors | present-consistent | at-home warm-scarf reject | Keep |

---

## Top 10 highest-impact adoption priorities — WOMEN FIRST

Ordered by estimated outfit-quality impact per engineering hour. Women-first items first.

1. **Dress silhouette capture (W1-W9, W33)** — add `dress_silhouette` field to items (A-line / sheath / bodycon / wrap / slip / empire / fit-and-flare / mermaid / shift); teach the analyze AI to infer it from photos. Unlocks most of the women's rules.

2. **Cocktail midi for evening occasions (W12, W18)** — for `date` / `dinner-out` / `party`, bias dress-length toward mini/midi/knee and material toward {silk, satin, chiffon, lace, velvet, sequined}. No schema change required.

3. **Sheath + blazer + pump for work (W32)** — for `work`, prefer (a) sheath-dress + blazer + pointed-toe pump (low/mid heel), or (b) tailored trousers + blouse + pump. Prompt-level.

4. **Shoe × occasion bias using subcategory (W15, W17, W18)** — kitten heels & ballet flats for brunch/date; strappy sandals for party/formal; pumps for work; mules for smart-casual. Uses existing `Subcategory` field, no schema change.

5. **First-date styling focus (W30)** — for `date` occasion, bias top detail / pretty factor; accept simpler bottom. Enrich existing `date` prompt guidance.

6. **Bag size scales with formality (A3)** — for `formal`/`party`/`date`: prefer `clutch`; for `work`: `handbag` / `tote`; for `at-home`: no bag (already done). Uses existing bag subcategories.

7. **One fitted + one loose (S3)** — post-parse validator: reject outfits where every item is `fit === "slim"` or every item is `loose`/`oversized`. Uses existing `fit` field.

8. **60/30/10 color cap (C1)** — post-parse: count distinct non-neutral color families; reject outfits with ≥4. Uses existing `colors` field.

9. **Three-layer stack for cold (Wx1)** — for <5°C, require warmth tiers (base 2-3, mid 3-4, outer 4-5). Uses existing `warmth_rating`.

10. **Shoes ≤ trouser luminance (F1)** — for `work` / `formal` / `dinner-out`, shoe primary L ≤ bottom primary L. Uses existing color data.

## Lower-priority but worth noting

- **Neckline → jewelry pairing (W19-W24)** — needs jewelry-subcategory split (necklace chain length / choker / pendant).
- **Hosiery rules (W25-W29)** — needs a new hosiery category.
- **Undergarment rules (W34-W38)** — needs undergarment category.
- **Body-shape rules (S6-S10, W1-W9 partial)** — needs a body-shape field on user profile; a meaningful onboarding addition if you want to go all-in on fit.

## Out of scope (needs new data capture)

- Body shape (W1-W9 full matching, S6-S10), height (A2, S15), undertone (C8), seasonal analysis (C13-C14), event time (O10), hosiery (W25-W29), undergarments (W34-W38), jewelry subcategories beyond "jewelry" (W19-W24).

## Contradictions

None. No rule in the skill directly contradicts what the app enforces.

## Potential revises

- **C10** — `color-engine.ts` single `neutral` class; canon splits warm (beige/ivory/khaki/brown) vs cool (black/grey/white).
- **S14 / S18** — focal-point and third-piece rules are present but softened in recent prompt trims; reinforce lightly.

---

*Generated against the skill corpus at `~/.claude/skills/fashion-styling-rules/` on 2026-04-21. Women-first rules added after initial gap analysis.*
