# Anchovy

Anchovy is a cross-platform glossary editor built around [GlossML](https://maxprograms.com/glossml/glossml.pdf) (Glossary Markup Language), an open, deliberately minimal XML vocabulary for storing monolingual and multilingual term lists. Anchovy runs on Windows, macOS and Linux.

## What you can do with Anchovy

- **Create and edit glossaries.** Build a glossary from scratch or open an existing one, add comment/term/definition columns per language, add or remove rows, and save in GlossML format.
- **Search and replace.** Find text across the open glossary, with case-sensitive and regular-expression matching, and replace one match or all of them.
- **Fix language assignments.** Reassign every term and definition column from one language code to another in a single operation, using standard [BCP 47](https://www.rfc-editor.org/info/bcp47) codes.
- **Extract term candidates from a document.** Analyze a monolingual document and generate a glossary of candidate terms, with control over minimum frequency and maximum term length, then review and prune the candidate list before saving.
- **Extract bilingual term candidates from XLIFF.** Read a translated XLIFF file and generate a bilingual glossary pairing source and target term candidates.
- **Convert between formats.** Import TMX, TBX, CSV and Excel files into GlossML, and export an open glossary to HTML, TMX, TBX, CSV or Excel. All conversions run natively in Anchovy, with no external processors or stylesheets required.

## Supported formats

- **GlossML** — Anchovy's native format: a compact XML vocabulary (6 elements, 4 attributes) for storing glossary data. Not intended for full terminology exchange, but simple enough to be trivial to generate, parse and version.
- **CSV** — with configurable character set, column separator and text delimiter, and a column-by-column preview for mapping columns to Skip/Comment/Term/Definition roles.
- **Excel (.xlsx)** — same column-mapping workflow as CSV, with worksheet selection.
- **TMX** (Translation Memory eXchange) — import only.
- **TBX** (TermBase eXchange, ISO 30042) — import only.
- **HTML** — export only, for sharing or printing a glossary.

## Requirements

- Node.js 24.18.0 LTS or newer. Get it from [https://nodejs.org/](https://nodejs.org/)
- OpenXLIFF Filters 6.2.0 or newer. Get it from [https://github.com/maxprograms-com/OpenXLIFF](https://github.com/maxprograms-com/OpenXLIFF)

## Building Anchovy

- Clone and build [OpenXLIFF Filters](https://github.com/maxprograms-com/OpenXLIFF).
- Clone this repository.
- Copy the `dist` folder from OpenXLIFF Filters to the root of this repository.
- Run `npm install` to download and install Node.js dependencies.
- Run `npm start` to launch Anchovy.

```shell
git clone https://github.com/maxprograms-com/OpenXLIFF.git
cd OpenXLIFF
gradle
cd ..
git clone https://github.com/maxprograms-com/Anchovy.git
cd Anchovy
cp -r ../OpenXLIFF/dist/* .
npm install
npm start
```

## Source code and subscriptions

Anchovy source code is available on GitHub and can be downloaded, compiled, modified, and used free of charge.

We offer subscriptions that include installers, technical support, bug fixes, and feature requests. Subscription fees support ongoing development and help maintain the quality and reliability of Anchovy.

The version included in the official installers can be used with a free 7-day trial by requesting an evaluation key. After the trial period expires, a subscription is required.

Subscription keys are available from the Maxprograms Online Store and cannot be shared or transferred between machines.

Subscription version includes direct email support at [tech@maxprograms.com](mailto:tech@maxprograms.com).

---

## Differences summary

| Differences | Source Code | Subscription Based |
| ----------- | :---------: | :----------------: |
| Ready-to-use installers | No | Yes |
| Notarized macOS launcher | No | Yes |
| Signed Windows installer | No | Yes |
| Restricted features | None | None |
| Technical support | Peer support at <https://groups.io/g/maxprograms/> | Email + peer support |
