# Embedded fonts

Instrument Serif Regular is used for the ARVONO wordmark in the header and footer, with its natural kerning. Instrument Sans is used for English shipment details. Anek Bangla is used for all Bangla text and the taka symbol, with OpenType shaping through PDFKit/fontkit. A mixed Bangla/English field uses Anek Bangla throughout so words retain consistent shaping and metrics.

Instrument Serif is the upstream static TrueType file at weight 400. Instrument Sans and Anek Bangla were instantiated at normal width (100) from the upstream Google Fonts variable fonts. Instrument Sans includes weights 400, 600, and 700; Anek Bangla includes 400 and 600. All fonts are local and subset-embedded in each generated PDF. No network or system fonts are needed at runtime.

- [Instrument Serif source](https://github.com/google/fonts/tree/main/ofl/instrumentserif)
- [Instrument Sans source](https://github.com/google/fonts/tree/main/ofl/instrumentsans)
- [Anek Bangla source](https://github.com/google/fonts/tree/main/ofl/anekbangla)

The corresponding SIL Open Font License files are included here. Keep them with the font files when redistributing this project.
