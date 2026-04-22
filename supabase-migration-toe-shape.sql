-- Add toe_shape to clothing_items so the outfit engine can apply shoe-
-- shape rules (pointed elongates the leg, round is the default comfort,
-- square reads trendy/casual, peep/open distinguish closed vs sandal).

alter table clothing_items
  add column if not exists toe_shape text
    check (toe_shape in (
      'round','almond','pointed','square','peep-toe','open-toe'
    ));
