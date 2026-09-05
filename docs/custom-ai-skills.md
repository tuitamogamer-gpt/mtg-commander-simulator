# Custom opponent skills

Open **Solo → choose a deck → Build this pod → Pod → Upload / manage custom AI skills**. For help choosing a base, read [AI archetypes and custom opponents](ai-archetypes.md).

1. Expand **Instructions & creation prompt**. Download a JSON template based on any built-in style, or copy the creation prompt into your own AI assistant. Replace `[DESCRIBE YOUR STYLE HERE]` with the opponent you want.
2. Upload the resulting `.json` file, drop it onto the upload area, or paste its contents. File imports are checked automatically; after editing, click **Check skill**.
3. Review the name, base and actual numeric settings. Click **Save skill**. Using the same `id` replaces that library entry, with a new immutable revision.
4. Close the workshop and select the skill from **Your custom skills** in any bot's **Play style**. Review the table, then start.

An editable example is in [patient-engine.json](examples/patient-engine.json). The workshop can export, edit or remove saved skills. A removed selected skill returns that seat to Random style. Random style always uses the original built-in pool, so installing a skill cannot change an unrelated seeded game.

## File format

`commander-ai-skill/v1` is declarative JSON, not a JavaScript, Markdown or LLM skill runner. The game never executes instructions or loads a model from an uploaded file. Descriptive text is displayed as text and has no effect on decisions.

| Field | Meaning |
| --- | --- |
| `schema` | Exactly `commander-ai-skill/v1`. |
| `id` | 3–40 lowercase letters, digits or hyphens, starting with a letter. Identifies a library entry. |
| `name` | Display name, 1–60 characters, one line. |
| `description` | Public display explanation, 1–400 characters, one line. |
| `baseStyle` | One of the built-in keys listed below. Full base policy is inherited. |
| `profileMultipliers` | Optional evaluation priorities. Each value must be 0.5–2. `1` preserves the base priority. |
| `roleBonuses` | Optional scores for casting cards. At most four roles, each from −6 to 6. Overlapping roles add together. |
| `reserveMana` | Optional integer 0–4. Soft preference to keep mana while holding interaction during main phase 1. Not a guarantee to keep that much mana untapped. |

Base keys: `aggressive`, `opportunist`, `passive`, `teaser`, `balanced`, `jimmy`, `rachel`, `post`, `olivia`, `josh`. The named styles are existing public-play-inspired game policies, not exact replicas or endorsements by their namesakes. A custom skill uses its own name and icon; it does not impersonate its base's portrait or reactions.

Every base key is a real game policy in the local AI, not only a label: the four core archetypes carry their own appetite for attacking, blocking, hunting wounded seats or the table leader, and casting creatures, damage, defence, politics, board wipes and counterspells; the five signature styles add their dedicated modes on top. A custom skill inherits the full policy of its base and then tunes it.

Evaluation priorities: `lifeSafety`, `boardPresence`, `cardAdvantage`, `manaDevelopment`, `interaction`, `commanderProgress`, `synergyProgress`, `graveyardValue`, `comboProgress`, `recoveryPotential`. Multipliers apply on top of both the deck profile and base policy, so `cardAdvantage: 1.3` means 30% more than the selected base's card-advantage weight.

Casting roles: `land`, `ramp`, `mana-rock`, `card-draw`, `card-selection`, `single-target-removal`, `artifact-removal`, `enchantment-removal`, `graveyard-hate`, `counterspell`, `protection`, `combat-trick`, `board-wipe`, `creature`, `token-maker`, `anthem`, `engine`, `sacrifice-outlet`, `death-payoff`, `graveyard-enabler`, `recursion`, `reanimation`, `tutor`, `finisher`, `combo-piece`, `commander-support`, `stax`, `lifegain`, `direct-damage`. These are the local evaluator's inferred card roles. A `land` bonus applies only if a card with that role is cast as a spell; ordinary land play is not casting.

Unknown fields, invalid types, out-of-range numbers and arbitrary code are rejected. Maximum file size is 32 KB and maximum library size is 20. These settings tune preferences; they do not create card rules, bypass legal actions, remove survival checks, reveal hidden cards, force a fixed action sequence or change the chosen difficulty.

## Creation command

The **Copy creation prompt** button supplies the full current field contract and example. A shorter instruction, when attaching the template, is:

> Create a Commander Simulator opponent skill based on the attached commander-ai-skill/v1 JSON template. My desired style is: [YOUR DESCRIPTION]. Pick the closest built-in base, then tune only the supported evaluation multipliers, up to four casting-role bonuses, and optional reserveMana. Explain the behavior in the description, but encode all customization in supported fields. Return only valid JSON, without Markdown or extra fields, ready to save as my-skill.json.

The game itself makes no external AI requests. Using a separate assistant to write the file is optional.

## Storage, saves and sharing

The skill library belongs to this browser/device, including when signed into an account; it is not an account-synced library. Export JSON backups before clearing site data. Invalid or inaccessible storage is reported instead of silently overwritten; the workshop offers an explicit reset for corrupt storage.

A selected skill's exact normalized revision is embedded in private Save/Continue checkpoints and shareable debug exports. Thus a later edit/removal from the library does not silently change an existing game's behavior. Restoring validates the revision before starting, without adding it to the local library. Names and descriptions are public metadata: do not put secrets into a skill you intend to share. These skills apply to Solo; Commander Live remains human-only.
