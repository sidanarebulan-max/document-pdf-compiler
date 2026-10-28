# Approved Word VSO template

`template.docx` is the first A4 page of the approved Word form, with customer details, dates, vehicle values, advisor contact/ID values and example amounts removed from the XML. Legacy background rules and logos are normalized to native DrawingML so one-page Word readers retain the complete layout. No populated customer document is included.

`template.pdf` is the matching one-page vector export. Static labels and rules remain PDF text/paths; only the two supplied dealer logos are image objects. `vso-word-core.js` adds the editable form values as embedded-font PDF text at the Word coordinates. The same completed bytes drive preview, download, profile saving and Compiler transfer. It never flattens the page to a canvas or JPEG.

To update from another approved Word file, run `scripts/prepare-vso-word.py` with the local source and this directory. Render and visually inspect the clean DOCX, then export its one-page PDF. Check the blank PDF for example data, logos and every border before replacing `template.pdf`. Bump the asset version in `vso-exact.js` and `index.html` together.

Dynamic typefaces are the unmodified upstream full fonts:

- Droid Serif Regular: Android `platform_frameworks_base`, `kitkat-release/data/fonts/DroidSerif-Regular.ttf`; Apache License 2.0.
- IBM Plex Sans Regular: IBM `plex`, `packages/plex-sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf`; SIL Open Font License 1.1.
- Open Sans Regular: Google Fonts `opensans`, `fonts/ttf/OpenSans-Regular.ttf`; SIL Open Font License 1.1.

The font licenses are included in this directory. The DOCX/PDF retain the embedded fonts and source logo artwork from the approved form.
