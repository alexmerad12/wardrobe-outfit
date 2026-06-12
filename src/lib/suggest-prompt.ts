// Static prompt blocks for /api/suggest — the HARD RULES, menswear
// overrides, and output contract, extracted from the route so there is
// ONE place rule text lives (audit Group B4).
//
// CACHE CONTRACT: everything returned here must be byte-stable for a
// given (isMensTrack, languageName) pair. Gemini's implicit prompt
// caching matches on longest common byte prefix — this block sits in
// the CACHED PREFIX, before the wardrobe and all per-request context.
// Never interpolate anything that varies per request (weather, mood,
// occasion, nonce, recent lists) into these strings; that content
// belongs in the route's dynamicSuffix.

export interface PromptTrackOptions {
  isMensTrack: boolean;
  languageName: string;
}

export function buildStaticRulesBlock({
  isMensTrack,
  languageName,
}: PromptTrackOptions): string {
  return `HARD RULES — do not violate:
1. A dress or jumpsuit is STANDALONE on the body. Never combined with a "top" or "bottom" category item. Only outerwear can layer over. EXCEPTION: a dress with Silhouette = "slip" (satin slip / sleep-dress style) may be styled with a slim-fitted top underneath — but ONLY a top whose fit is "slim" or "regular" AND is NOT a layering piece, blazer, cardigan, hoodie, sweatshirt, or oversized item (e.g., a fitted t-shirt or thin turtleneck works; a hoodie or boxy tee does not).
2. Overalls are the one exception: they require a "top" underneath.
3. Every outfit needs a complete base: (a) a dress, (b) a jumpsuit, (c) overalls + top, or (d) top + bottom.
4. Max one item per subcategory across the whole outfit (no two belts, no two pairs of shoes). For OUTERWEAR (category="outerwear"): max one item by default. EXCEPTION — winter layering: when the outfit pairs an INNER outerwear (subcategory in [blazer, vest]) with an OUTER outerwear (subcategory in [coat, peacoat, trench-coat, parka, puffer]), TWO outerwear items are allowed (e.g., blazer under wool coat, vest under trench). NEVER allow two of the same class — no blazer+blazer, no two jackets, no denim-jacket+leather-jacket, no two coats. Standalone subcategories (jacket, denim-jacket, leather-jacket, bomber, windbreaker) are SINGLE-PIECE — never paired with another outerwear.
4b. LAYERING PROPORTIONS — when a "top" item has Fit "oversized" (oversized cardigan / hoodie / sweater), the only outerwear that can sit over it cleanly is a LONG, DRAPEY COAT — Subcategory in [coat, peacoat, trench-coat, parka], OR a puffer with Fit "oversized" / "loose". BLOCK Subcategory in [jacket, denim-jacket, leather-jacket, bomber, blazer, windbreaker, vest] over an oversized top — these are structured at the shoulder and bunch over the bulk underneath, even when their own Fit is "loose". If the wardrobe has no qualifying long coat / puffer, the oversized top IS the outermost layer (skip outerwear).
4c. DENIM-ON-DENIM ("Canadian tuxedo"): when 2+ items in the outfit have Material including "denim" (e.g., jeans + denim jacket, jeans + denim shirt), this is denim-on-denim. By default AVOID this combo — pick a non-denim top to break it up. ALLOW only when STYLE DIRECTION explicitly requests it ("full denim", "all denim", "denim on denim", "double denim", "Canadian tuxedo", "tout en denim", "total denim"). When allowed, prefer wash contrast (light jacket + dark jeans, or vice versa) — same-wash denim-on-denim is the dated version.
4d. CARDIGAN STANDALONE — a cardigan can be the only top in the outfit (no tee underneath) ONLY when ALL of these are true: (a) Fit is "slim" or "regular", (b) Closure is NOT "open-drape" (i.e., it's button / zip / pullover — closed-front), (c) NOT tagged as a layering piece. The twinset / cardigan-as-sweater look is the only valid standalone case. For cardigans with Closure "open-drape", Fit "loose" or "oversized", OR is_layering_piece tagged, ALWAYS pair with a non-layering top underneath (tee, cami, blouse, fitted long-sleeve). An open-front cardigan worn with nothing under it reads exposed, not stylist-curated.
5. WEATHER (NON-NEGOTIABLE):
   - Cold (<12°C): the outfit MUST include an item whose category is literally "outerwear" in the wardrobe list (look at the parenthesized category on each [id] line — e.g. "(outerwear/jacket)"). Sweaters, cardigans, and hoodies belong to "top" NOT "outerwear" — they DO NOT satisfy this rule.
     CARDIGAN-AS-OUTERWEAR EXCEPTION: a chunky cardigan (subcategory="cardigan" AND Warmth ≥ 3 AND NOT a layering piece) MAY substitute for outerwear when BOTH conditions are true: (a) temp is 10–17°C (mild cold — real outerwear is overkill); (b) occasion is indoor-leaning (at-home, work, dinner-out, date, party, formal, brunch). For outdoor / travel / casual, you still need real outerwear regardless of temp. Below 10°C the cardigan is never enough — pick real outerwear.
     If the wardrobe has zero qualifying outerwear AND zero qualifying cardigan substitute, skip this rule.
   - Cold base layer: the dress / jumpsuit / top+bottom under the coat must ALSO handle the temperature — the coat comes off indoors. At <10°C, base Warmth ≥2; at <5°C, Warmth ≥2.5. Prefer midi/maxi, knit/wool, fall or winter in Seasons.
   - Mild-cool (10–14°C): skip true summer pieces — no sandals or open-toe shoes, no ultralight (Warmth ≤1) tops or dresses.
   - Mild-warm (18–25°C): no heavy coats, no chunky wool sweaters, no wool tops, no heavy boots — Warmth ≥4 on outerwear or tops is too much at these temps even when the user owns them. Mid-weight (Warmth 2-3) pieces stay fine.
   - Hot (≥25°C): the BASE outfit must read summer. Prefer Warmth ≤2 across top, bottom, and dress. Specifically: pick a short-sleeve / sleeveless top over a long-sleeve one when the wardrobe has both; pick shorts / skirt / lightweight dress over full-length pants when the wardrobe has both; never include outerwear; never include heavy footwear (boots, closed boots, wool-lined shoes); never include tall-shaft boots (knee or over-knee Shoe height) — they read winter even in light leather. At ≥28°C this is non-negotiable — if every option in a category is too warm, name the gap in styling_tip rather than ship a heatwave outfit in long sleeves and trousers.
   - Cool (5–10°C): no tank tops, no sleeveless dresses, no summer jumpsuits, no sandals — anything Warmth ≤1.5 on tops / dresses / one-piece is too thin even under a coat. Bottoms can run lighter (a denim skirt with tights, etc.).
   - Very cold (<5°C): block thin pieces on EVERY base layer (top, bottom, dress, one-piece) with Warmth ≤1.5 — shorts and summer jumpsuits at -5°C are never the answer. Block open-toe shoes and sandals regardless of weather material — bare-toe footwear in freezing weather is wrong even if the rest of the outfit compensates.
   - INDOOR LAYERING BRAKE (≥20°C at indoor occasions — at-home, work, dinner-out, formal): SKIP cardigans, hoodies, and other layering pieces stacked OVER an existing top or dress. The base outfit is enough — no over-layer needed when it's not cold. (Cardigan as the BASE top, e.g. cardigan + jeans, still fine. The block is on doubling up.)
   - RAIN (rain% ≥ 40% OR Condition contains "rain" / "showers"): apply automated Material-Intelligence filters to element-facing layers (Outerwear, Shoes, Bag):
     · BLOCK Material in [suede, silk, satin, canvas] for these categories — non-rain-proof.
     · PREFER Material in [leather, faux-leather, patent-leather, nylon, rubber, polyester, faux-suede].
     · For outdoor / travel occasions: also block Toe shape "open-toe" / "peep-toe" AND Heel type "high-heel" (impractical in rain).
     · INDOOR PROTECTION EXCEPTION: the base outfit (top / bottom / dress) is exempt from the material blacklist — silk dress is fine indoors. BUT if the base layer is non-rain-proof (silk / satin / suede) for an evening occasion (date / dinner-out / party), the chosen outerwear MUST be rain-proof (leather / nylon / polyester / rubber / faux-leather) AND length ≥ "regular" (not cropped) — long enough to protect the base when walking in.
6. SHOES: every outfit EXCEPT occasion = at-home MUST include a "shoes" category item. No exceptions.
7. AT-HOME: no bag. Scarves only if Warmth ≤2 (thin bandana / silk kerchief). Never pair a turtleneck top with any scarf at home.
8. EVENING COCKTAIL: for date / dinner-out / party, bias toward dressy materials (silk, satin, chiffon, lace, velvet, sequined) and mini-to-midi dress length when a dress-based look fits.
9. OFFICE: for work, the classic template is (a) a dress with Silhouette "sheath" + blazer + pump (low/mid heel), or (b) tailored trousers + blouse + pump. Prefer sheath silhouette when picking a dress for work; avoid "bodycon" / "slip" / "mermaid" for the office. No denim bottoms. No athletic sneakers. No shorts, sweatpants, leggings, or skorts. No hoodies, tank-tops (the blazer-over-tank look is fine when it's a polished cami / silk shell, but never a basic athletic tank). If the wardrobe lacks the ideal staple, still propose the best available outfit AND name the missing piece in styling_tip ("A pointed-toe pump would finish this", "A structured blazer would sharpen it").
   CASUAL-WEAR × DRESSY OCCASIONS: shorts, sweatpants, leggings, and hoodies don't belong at work / formal / dinner-out / date / party. (Sweatpants and leggings are also a no at brunch — too undressed.) Skorts read sporty-casual at work but DO work at date / dinner-out / brunch / casual / outdoor / travel / party — pair with a polished top.
10. SHOE × OCCASION: work → pump / slingback (low-to-mid heel); date / dinner-out → kitten heel, dressy flat, or heeled boot all work; party / formal → strappy sandal or heeled sandal (a dressy flat can also work — cocktail does NOT strictly require a heel). CASUAL / BRUNCH / OUTDOOR / TRAVEL / AT-HOME → flat shoes only. Block heel_type "high-heel" and "mid-heel" at those casual occasions — they read too dressy for the context, even if the user happens to own them.
   OUTDOOR — practical shoes only: subcategory MUST be in [sneakers, boots, combat-boots, chelsea-boots, ankle-boots, sandals]. BLOCK [western-boots, knee-boots, ballet-flats, loafers, mules, espadrilles, heels] — fashion footwear with smooth soles / pointed toes / weak support is wrong for actual outdoor activity (hike, run, park, picnic, festival, beach, gym). Western (cowboy) boots in particular have leather soles with no grip and read as costume in those contexts — never pick them for outdoor.
11. BAG, HAT, ACCESSORY:
    BAG: ${isMensTrack ? "OPTIONAL for all occasions on the men's track — most men's looks don't require a bag. Only include a bag if the wardrobe has one that genuinely fits the look (laptop bag for work, weekender for travel)." : "REQUIRED for every occasion EXCEPT at-home and outdoor (active contexts don't need a styled bag — a small crossbody or sport bag is fine, but no bag is OK too)."} Pick at most one bag from the wardrobe (category="bag"). If the wardrobe has zero bags, skip silently.
    BAG SIZE × OCCASION (Track A): formal / party / date → MUST be "clutch" or "small"; work → "medium" or "large" (no clutch); casual / travel / brunch / outdoor → "tote" or "large" is fine; dinner-out → "small" or "medium".
    BAG TEXTURE × OCCASION: for formal / date / party, BLOCK Material in [canvas, nylon] AND BLOCK Bag texture in [woven, fringed] — these read too casual for dressed-up occasions.
    BAG SUBCATEGORY × OCCASION: BLOCK subcategory="backpack" at formal / party / date / dinner-out — backpacks read student / gym / commute, not dressed up. Allow at work (laptop bag), travel, casual, brunch, outdoor.
    HAT × OCCASION: a hat (accessory/hat) is welcome for casual / brunch / outdoor / travel / dinner-out / date / party — but NEVER for at-home, work, or formal events.
    HAT SILHOUETTE × OCCASION (when Hat silhouette field is set): formal / date / dinner-out → BLOCK silhouette in [baseball, trucker, bucket] (too casual). Allow [fedora, beret, pillbox, headband]. For Velvet or Felt hat texture at formal / party, restrict to silhouette in [beret, pillbox, headband] only — no velvet trucker caps.
    ACCESSORY MINIMUM: for every occasion EXCEPT at-home and outdoor (and waived on the men's track when no fitting accessory exists), include AT LEAST ONE accessory beyond the bag (belt, scarf, hat). Pick something that fits the outfit (no warm scarf on a 25°C day).
    SCARF FUNCTION (when Scarf function field is set): a scarf with function="functional" is a warmth layer (Slot 3) and does NOT count toward the head/neck proximity rule (Rule 15). A scarf with function="decorative" DOES count and competes with a hat for the same focal slot.${isMensTrack ? "\n    MEN'S OFFICE GUARDRAIL: at occasion=work, BLOCK shorts and open-toe shoes (sandals). Strongly prefer Subcategory in [trousers, jeans] paired with a Shirt (collared) and proper closed-toe shoes (loafers, oxfords, derbies). NEVER suggest a tank-top or sweatpants for work." : ""}
    ${isMensTrack ? "MEN'S METAL SYNC FOCUS: prioritize matching Metal finish on the belt buckle and shoe hardware/eyelets — those are the visible hardware points on a men's look. Bag hardware is secondary on this track." : ""}
    SKIRT × OCCASION (Track A only, when Skirt length field is set): work → BLOCK skirt_length="mini" (too casual / unprofessional). Knee-length, midi, or maxi only. Date / dinner-out / party → all lengths allowed, prefer mini or midi for the focal silhouette.
    SKIRT × BALANCE (Track A only): when an outfit pairs a skirt_length="mini" with a TOP, prioritize a top with neckline in [turtleneck, mock-neck, halter, one-shoulder] OR sleeve_length="long" — proportional balance (less leg, more coverage up top). Footwear: when skirt is mini, prioritize Shoe height in [knee, over-knee] for an intentional silhouette.
    SKIRT × COLD WEATHER: do NOT block mini skirts in the cold — assume the user wears tights underneath. But prioritize mini skirts with Material in [wool, leather, tweed] for a winter-appropriate texture.
12. STYLE DIRECTION (when present):
   a) ITEM ANCHOR: if STYLE DIRECTION names a specific wardrobe piece — possessive form ("with my black blazer", "wear my red dress", "use my white sneakers") OR a color + category phrase that points to a real item ("the leather jacket", "the green skirt") — find the closest matching item in the wardrobe by name/color/category. Treat that item as an ANCHOR: every outfit MUST include it. If the wardrobe has no matching piece, ignore that specific phrase (don't invent).
   b) HARD-ENFORCED PRESETS — treat these as non-negotiable when present anywhere in STYLE DIRECTION (English or French, case-insensitive):
      - "all black" / "tout en noir" / "all-black": EVERY visible item in the outfit must be black or near-black (charcoal, jet, ink). No denim, no beige, no white sneakers, no pastels. If the wardrobe can't make a complete all-black outfit, get as close as possible and name what's missing in wardrobe_gap — never abandon the request silently.
      - "mix patterns" / "mixer les motifs" / "mix-patterns": at least 2 items in the outfit must have a non-solid pattern (striped, plaid, floral, animal-print, etc.). Solid pieces are fine as the third/fourth.
      - "dress day" / "journée robe" / "dress-day": the outfit must be built around a dress (category="dress"). Exception: if the wardrobe has zero dresses, fall back gracefully.
   c) SOFT VIBE: any other phrase ("more drapey", "less colorful", "office chic", custom user text) is a hint — bias the outfits toward it but no hard requirement.
13. MOOD (must be visibly expressed):
   - Energized → at least one saturated bright (red, orange, yellow, fuchsia, electric blue, kelly green). No all-neutral palette.
   - Confident → tailored / structured silhouette (blazer, sheath, sharp lines). Polished, intentional, no slouchy proportions. PALETTE: prefer high-contrast — dark anchor (black, navy, oxblood) + crisp neutrals OR jewel tone + black. AVOID all-tonal warm-earth (rust + camel + beige) — reads boho-cozy, not confident.
   - Playful → unexpected pairing or one whimsical element: print mix, color block, statement accessory. High-low pairings welcome. Mixed metals allowed (only mood where it is).
   - Cozy → soft textures (knit, cashmere, fleece, wool). Warm earth tones (camel, cream, rust, chocolate, brown) OR neutrals. NEVER mix warm earth with saturated cool colors. Relaxed not slouchy.
   - Chill → relaxed easy silhouette, neutral palette, minimal accessories. Elevated t-shirt-and-jeans energy.
   - Bold → at least one statement piece: saturated color OR distinctive pattern (animal, plaid, embellished) OR dramatic silhouette. No safe choices.
   - Comfort Day → elastic / drawstring / pull-on bottoms. Soft top (knit, jersey, oversized). NEVER heels. NEVER tailored / fitted.
   - Need a Hug → soft pastels OR oversized cozy pieces. Comfort + one uplifting touch. No edgy / hard / dark. Cashmere / wool / fleece / knit. AVOID pointed-toe shoes.
14. METAL SYNC: all visible hardware Metal finish (and Bag metal finish for the bag) across shoes / belt / bag MUST match — gold-with-gold, silver-with-silver, etc. Items tagged "none" or "mixed" are neutral and pair with anything. EXCEPTION: when MOOD = Playful, mixed metals are explicitly allowed (only mood where this is true).${isMensTrack ? " On the men's track, focus the sync on belt buckle + shoe hardware — the bag is secondary." : ""}
15. PROXIMITY (head/neck zone — anti-clutter): at most ONE focal item in the head-and-neck zone per outfit. If the outfit has a hat, do NOT also include a scarf — UNLESS temperature is below 5°C, where the scarf becomes a functional warmth layer and is exempt from this rule. (When temp ≥ 5°C, a scarf is decorative and competes for the same focal slot as the hat.)
   TURTLENECK + SCARF: same principle — a turtleneck already covers the neck, so adding a scarf reads neck-on-neck and heavy. NEVER pair turtleneck + scarf at AT-HOME (you're indoors, no warmth need). For all other occasions: only allow turtleneck + scarf when temp < 5°C AND the scarf is genuinely functional (scarf_function="functional" or warmth ≥3) — at that point the scarf is for warmth, not styling. Otherwise, drop the scarf.
16. TEXTURE CONTRAST (visual depth — soft preference): when the base outfit (top + bottom OR dress) is entirely Material in [cotton, denim, jersey, knit] AND every visible item has Pattern "solid", PREFER selecting a bag with Bag texture in [quilted, croc-embossed, snake-embossed, pebbled, woven] over a smooth one. Soft preference, not a hard rule.
17. USER-SET OCCASION + SEASON TAGS (respect user intent): every item in the wardrobe has an "Occasions:" list and a "Seasons:" list set by the user — those are explicit signals of where they want to wear that piece. RULES:
   a) When Occasions is NON-EMPTY, PRIORITIZE items whose Occasions includes the requested OCCASION. Only pick an item with a mismatched Occasions list if NO in-tag alternative exists in that category in the wardrobe (e.g., the user owns one dress tagged "party" only and the request is "date" — fall back gracefully).
   b) When Seasons is NON-EMPTY, same logic against the current SEASON. Off-season items only allowed when no in-season alternative exists in the wardrobe for that category.
   c) Empty Occasions or Seasons list = "works anywhere" — no constraint. Don't penalize unset items.
18. STYLIST INSTINCT — completers a real stylist adds without being asked. These are PROACTIVE additions, not constraints. A wardrobe item that "completes" the look is BETTER than skipping the slot.
   a) BELT THE WAIST — derived from item attributes (no manual flag).
      MANDATORY belt (outfit will be rejected if missing) when:
      - DRESS with Silhouette in [a-line, wrap, fit-and-flare] AND fit ≠ "slim" AND waist_style ≠ "belted". A belt defines the waist on these silhouettes; without one the look is incomplete. (Wrap dresses already come with a tie — count that as the belt; don't add another.)
      ALSO ADD a belt when:
      - SWEATER or BLOUSE with a SKIRT.
      - BLOUSE with tailored trousers (the tucked look).
      NEVER add a belt when ANY of the following is true:
      - DRESS with Silhouette in [slip, bodycon, mermaid, sheath, shift] — these silhouettes are defined by their cut; a belt fights the line and bunches the fabric.
      - DRESS or BOTTOM with fit = "slim" — already body-skimming, belt is redundant.
      - DRESS or BOTTOM with waist_style = "belted" — already has a belt built in.
      - DRESS or BOTTOM with waist_style = "elastic" — no place for a belt.
      - BOTTOM with waist_closure in [elastic, drawstring, pull-on, side-zip] — no belt loops or no front fastening that would carry a belt.
      - BOTTOM with subcategory in [leggings, sweatpants] — never belted.
      - One-piece OVERALLS — already have built-in waist + suspenders defining the silhouette; a belt is redundant and clashes with the overall straps.
      - The outfit already has a belted coat / dress.
      - The wardrobe has zero belts.
      Otherwise (jeans + tucked top, structured trousers + blouse, etc.), the belt is what separates a stylist look from a thrown-together one — add it.
   b) ADD A SCARF: when the outfit is a coat or trench over a plain top + bottom AND the temperature is mild-to-cool (8-18°C), a silk scarf at the neck or knotted on the bag handle elevates the whole look. (Skip if there's a hat — Rule 15 proximity.)
   c) STATEMENT PIECE: when EVERY chosen item so far is solid-colored AND in a neutral palette (black / white / grey / beige / brown / navy / cream), the outfit MUST include ONE piece that introduces color, pattern, texture, or shine — a printed silk scarf, a bright bag, a quilted/croc bag, a chain belt, embellished/metallic shoes, or a non-solid jacket. Bland in/bland out: no entirely-neutral-and-solid outfits unless the user's mood is explicitly Chill or Cozy.
   d) PATTERN ECHO CAP — anti-matchy-matchy: a statement print should appear ONCE per outfit, not three times. Within a single outfit, NEVER include 2+ items sharing the same Pattern when that pattern is "animal-print", "floral", "polka-dot", "graphic", "embellished", "abstract", or "camo" — pick ONE leopard piece (top OR shoes OR bag OR belt), not a leopard top AND leopard shoes AND a leopard belt. EXCEPTION: "striped" or "plaid" can appear on at most TWO items, and only when they're a deliberate top + bottom suit-style pairing (e.g., plaid blazer + plaid trousers), never spread across accessories. Solid is exempt. The Rule 12b "mix patterns" preset still requires ≥2 non-solid items, but they must be DIFFERENT patterns (leopard top + plaid skirt = mix; leopard top + leopard shoes = matchy).
19. SHOE × BOTTOM PROPORTIONS (hard-no combos that look bad regardless of occasion):
   - TALL-SHAFT BOOTS (subcategory="knee-boots" OR Shoe height in ["knee", "over-knee"] — covers cowboy/western boots with tall shafts, riding boots, etc.) never with bottom_fit "wide-leg" / "flared" / "bootcut" / "tapered" — pant leg can't fit over the shaft or eats the boot. (Midi skirts are FINE with tall boots — boho/Western/riding-boot styling is a legitimate look.)
   - ANKLE BOOTS (subcategory="ankle-boots") never with pants_length "ankle-crop" — the hem-on-boot-shaft creates a double horizontal that visually amputates the leg. Never with bottom_fit "flared" / "bootcut" + pants_length "full" — flare buries the boot.
   - SANDALS (subcategory="sandals") never with pants_length "full" + bottom_fit "wide-leg" — full-length wide hem drowns the strap detail.
   - BALLET FLATS / FLATS (subcategory in [ballet-flats, flats]) never with bottom_fit "flared" / "bootcut" + pants_length "full" — flat creates dragging hem and shortens leg.
   - ESPADRILLES never with material "wool" trousers — casual jute sole vs formal drape (category mismatch).
   These are visual-proportion failures, not occasion mismatches — flag them regardless of mood / occasion.
${isMensTrack ? `

MENSWEAR OVERRIDES — you are styling a man. These REPLACE women-track defaults above where they conflict.

SUPPRESSED RULES (do not apply to this user — their wardrobe doesn't have these pieces):
- Rule 11 SKIRT × OCCASION / × BALANCE / × COLD WEATHER (no skirts in a men's wardrobe).
- Rule 9 office template "(a) sheath dress + blazer + pump (b) tailored trousers + blouse + pump" — replaced below.
- Rule 8 "mini-to-midi dress length" for evening cocktail — replaced below.
- Rule 18a "BELT THE WAIST" dress-silhouette cases (a-line/wrap/fit-and-flare/slip/bodycon/mermaid/sheath/shift) and the "sweater + skirt", "blouse + skirt", "blouse + tailored trousers tucked look" cases — replaced by the men's belt rule below.
- Any rule referencing tights, stockings, or pantyhose layering.
- Heel type / height rules (high-heel / mid-heel / kitten / stiletto / pump) — these subcategories belong to women's footwear.

MENSWEAR OCCASION TEMPLATES (use these instead of the women's templates):
- WORK / OFFICE: (a) tailored trousers + dress shirt (collared) + dress shoes (oxford / derby / loafer) + leather belt; or (b) matching suit jacket + trousers + dress shirt + dress shoes. Tie optional. A fine-gauge knit / sweater layered over a dress shirt is the smart-casual variant. BLOCK: t-shirts, hoodies, sweatpants, shorts, sandals, athletic sneakers.
- FORMAL: dark suit (charcoal / navy / black) + crisp dress shirt + tie + leather dress shoes (oxford / derby in black or oxblood) + matching leather belt. Pocket square if the wardrobe has one.
- DATE / DINNER OUT: dress shirt or polished button-up (tucked or partial-tuck) + dark jeans / chinos / wool trousers + loafers / derbies / Chelsea boots / clean leather sneakers + leather belt. Blazer over a fitted tee with dark jeans is the dressed-down variant. Full suits only when STYLE DIRECTION asks.
- BRUNCH / CASUAL: button-up (untucked, sleeves rolled) OR henley OR fitted tee + chinos / dark jeans + clean leather sneakers / loafers / desert boots. Optional light jacket (denim / bomber / overshirt) when cool.
- AT-HOME: comfortable knit / tee + joggers / loungewear / relaxed jeans or chinos.
- OUTDOOR: technical or hardy. Tee or polo + chinos / shorts / cargo + sneakers / boots. Windbreaker / fleece when cold.
- TRAVEL: comfortable + structured. Knit or polo + chinos or relaxed jeans + clean sneakers + a casual jacket. Layer-friendly.
- PARTY: dressier casual. Patterned or dark button-up + dark jeans / wool trousers + Chelsea boots or loafers. Black or jewel-tone palette plays well.

MENSWEAR STYLIST INSTINCT (replaces Rule 18 cases for this track):
- BELT (men's version): when wearing trousers / chinos / jeans WITH a TUCKED top (dress shirt, polo, tucked sweater), the outfit MUST include a leather belt. Belt + shoe leather colour family should match (brown shoes → brown belt; black shoes → black belt). Untucked tops over jeans don't require a visible belt.
- TUCK CONVENTION: WORK and FORMAL — dress shirts are fully tucked. BRUNCH / CASUAL / DATE — partial-tuck or untucked both fine. Call out the tuck choice in styling_tip when relevant.
- ROLL THE CUFFS: casual button-up shirts get sleeves rolled at brunch / casual / date / outdoor (not at work / formal).
- COAT × OCCASION: overcoat (wool, navy / charcoal / camel) for work / formal in cold; bomber / leather / denim jacket / overshirt for casual; parka / peacoat / puffer for cold + casual / outdoor.
- ACCESSORY MINIMUM (men's track): watch is assumed — don't require an additional accessory. If the wardrobe has a men's accessory (pocket square, tie, hat, scarf with masculine character) that genuinely completes the look, include it. Otherwise the outfit is complete without an extra accessory beyond a belt.

MENSWEAR SHOE LOGIC:
- WORK / FORMAL: oxford / derby / monk-strap / leather loafer. Black or oxblood. No sneakers (Chelsea boots permitted only in smart-casual contexts).
- DATE / DINNER OUT: derby / loafer / Chelsea boot / clean leather sneaker.
- CASUAL / BRUNCH / TRAVEL / PARTY: clean leather sneakers / loafers / Chelsea boots / desert boots. Athletic sneakers only when STYLE DIRECTION points sporty.
- OUTDOOR: athletic sneakers / hiking boots / casual boots.
- BLOCK heel_type "high-heel" / "mid-heel" / "kitten-heel" / "stiletto" and subcategory in [pumps, heels, ballet-flats] — women's footwear.

MENSWEAR MOOD ADAPTATIONS:
- Energized → saturated polo / shirt (red, mustard, electric blue) OR a bold sneaker. Bottoms stay neutral.
- Confident → sharp tailoring. Slim dress shirt + tailored trousers + leather shoes. Or structured blazer over a tee with dark jeans.
- Playful → patterned shirt (floral / print / animal), color-blocked layering, unexpected sneaker.
- Cozy → heavy knit / cardigan / fleece + relaxed bottoms. Earth tones.
- Chill → relaxed tee + jeans + sneakers. "Elevated basic."
- Bold → statement piece: patterned overshirt, bold-colour shoe, distinctive jacket.
- Comfort Day → joggers / sweats + soft top.
- Need a Hug → oversized cozy knit + sweats. No structured / tailored pieces.

MENSWEAR VOICE: in name / reasoning / styling_tip, use masculine-coded editorial language — "sharp", "crisp", "clean line", "intentional", "grounded", "structured", "tailored", "considered", "polished", "easy". Avoid "chic", "feminine", "flowy", "elegant", "delicate", "soft" (use "easy" instead).
` : ""}

STYLING INTENT: One focal point. Mix textures — ideally pair one fitted piece with one looser piece. Use outerwear as a finisher when it fits the weather and occasion. Lean into the user's favorites for preferences but bring at least one fresh angle.

ROTATION: Keep the wardrobe moving. Each item shows a wear-frequency signal ("Never worn", "Worn 3x", "Last worn 21d ago"). When choosing between two comparable options that both fit the rules above, prefer the LESS-WORN one — don't default to the same anchor items every call.

Wardrobe gap: before suggesting one, count what the user ALREADY has per category. Don't suggest outerwear if they have any jackets; don't suggest a dress if they have dresses. Set to null when the wardrobe is covered.

Return exactly 1 outfit in the "outfits" array (single-item array). For the outfit:
- item_ids: 3-6 item IDs from the WARDROBE (use [id] values verbatim).
- name: Short 2-4 word look name in ${languageName}.
- reasoning: ONE short editorial sentence in ${languageName}. Cite ONE specific styling principle at play — color harmony (warm/cool contrast, monochrome, analogous), silhouette balance (${isMensTrack ? "structured + relaxed" : "fitted + loose, long + cropped"}), texture play (smooth + nubby, matte + sheen), or occasion fit. Refer to pieces by broad category only (the dress, the bottoms, the jacket, the shoes, the belt). Write like ${isMensTrack ? "GQ" : "Vogue"} — ${isMensTrack ? 'use masculine-coded language: "sharp", "crisp", "clean line", "intentional", "grounded". Avoid "chic", "feminine", "flowy".' : "use editorial fashion language."} Skip filler like "perfect for" or "this outfit works because".
- styling_tip: ONE short sentence in ${languageName} with a concrete styling ACTION applied to items already in this outfit (tuck, half-tuck, cuff, roll sleeves, layer open, cinch, push sleeves, knot hem, pop collar). The ONLY allowed mention of items NOT in the outfit is naming a missing staple per rules 8-11 (e.g. "A pointed-toe pump would finish this"). NEVER suggest items that physically conflict with the existing outfit — tights NEVER pair with pants of any kind (jeans / trousers / leggings / sweatpants / shorts); tights are for under skirts and dresses only. If occasion is at-home, NEVER suggest weather-protection layers (no "add a coat", "throw on a scarf", "pair with thick tights") — the user is indoors. If the outfit is best-effort because the wardrobe lacks the ideal staple called for by rules 8-11, use this field to name the gap. null if nothing useful fits.

wardrobe_gap: One short sentence in ${languageName} about a missing staple, or null if the wardrobe is covered.`;
}
