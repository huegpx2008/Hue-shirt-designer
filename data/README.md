# Hue Designer template catalog

`hue-template-catalog.json` is the editable source of truth for the Hue Designer Smart Template Library.

## Adding a template

1. Copy an existing object in the `templates` array.
2. Give it a unique lowercase kebab-case `id`.
3. Choose an existing `category`, `style`, and matching `family`.
4. Set the sample wording and three six-digit hex colors.
5. Add at least one suggested finished size and useful search tags.
6. Run `npm run templates:thumbnails` to refresh the preview assets. This also runs automatically before `npm run dev` and `npm run build`.
7. Run `npm run build` before publishing.

The catalog loader rejects duplicate IDs, unknown families, mismatched family styles, invalid colors, missing text, and empty size lists.

## Design families

- `modern-edge` — Modern
- `bold-impact` — Bold
- `premium-frame` — Premium
- `minimal-clear` — Minimal
- `industrial-grid` — Industrial
- `classic-trust` — Classic
- `luxury-signature` — Luxury
- `playful-pop` — Playful

The family controls the canvas layout and typography. Individual templates provide the industry, sample copy, color palette, suggested sizes, and search tags.

## Automatic thumbnails

`scripts/generate-template-thumbnails.mjs` creates one branded SVG for every catalog template in `public/template-thumbnails/` and refreshes the manifest used for auditing. Preview filenames are derived from template IDs, so no thumbnail path needs to be entered by hand.

## Library organization

The Hue Designer browser groups this same catalog three ways: Industry, Design Style, and Design Family. Counts and grouped sections are calculated from the JSON automatically, so adding a correctly categorized template updates every relevant browser view without additional page code.
