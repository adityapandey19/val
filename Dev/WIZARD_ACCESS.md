# RXBE Wizard — Access Assessment

## What is the Wizard?

The **RXBE Wizard** is a proprietary web application that generates the `ui_value` fields in every
`Indicator` object — i.e., the values this validator is trying to *verify* against public sources.

It is **not** part of this repository. Per `CLAUDE.md`:
> "The RXBE Wizard is proprietary. Its link/HTML is for reference and field mapping only."

---

## Can we access it now?

**Short answer: No — not yet.**

`CLAUDE.md` says the human (you) will share:
1. Danish's GitHub validation repository/UI ← *this repo, ✅ we have it*
2. **The RXBE Wizard HTML/application reference** ← ❌ **not yet shared**
3. The data-source registry and PNG workbook ← ❌ **not yet shared**

Items 2 and 3 are required to:
- Map Wizard field labels → `indicator_id` keys
- Confirm which Wizard values are live/source-derived vs. hardcoded assumptions
- Verify units, geography, and reporting period per field

---

## What we can do without it

The `request_json_example.json` file gives us the *already-mapped* indicator list for PNG:
- 45 indicators with `indicator_id`, `display_name`, `source_url`, `ui_value`, `tolerance`, and `unit`
- This is effectively Danish's manually constructed mapping of Wizard → source

We can build the scraper using this as the source of truth **without needing live Wizard access**,
as long as we treat `ui_value` in that file as the reference value the Wizard would show.

---

## What to ask for

To fully validate the Wizard ↔ source mapping, we will eventually need:

| Item | Why needed |
|---|---|
| Wizard URL or HTML export | Verify field labels and values match `request_json_example.json` |
| PNG workbook / data-source registry | Confirm source URLs, json_paths, tolerances per field |
| Any fields marked "user assumption" or "calculated" in the Wizard | These should remain `SKIPPED` — no source to verify |

---

## Action for now

➡️ We proceed using `request_json_example.json` as the Wizard proxy.
➡️ When you have the Wizard link, share it and we will do a field-by-field cross-check.
