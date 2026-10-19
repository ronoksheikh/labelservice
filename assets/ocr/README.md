# Local OCR models

Bundled Bengali (`ben`) and English (`eng`) LSTM models from the Tesseract.js data packages, version **1.0.0**, directory `4.0.0_best_int`. These integer models are compatible with the Tesseract.js WebAssembly runtime. Model data is licensed under Apache 2.0; see `LICENSE`.

- https://cdn.jsdelivr.net/npm/@tesseract.js-data/ben@1.0.0/4.0.0_best_int/ben.traineddata.gz
- https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz
- Upstream: https://github.com/naptha/tessdata

SHA-256:

```text
a7c1fd170b796d6b8d01b401d4bfcc54409f47b313a200e9e3756ce20d742725  ben.traineddata.gz
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  eng.traineddata.gz
```

Both files are loaded from this directory and verified before a worker starts. Importing never downloads models or sends document contents to a service. No trained-data cache is written. A worker is created only for damaged recipient text and terminated after its PDF import completes.

The importer scans every wrapped Bangla line in an affected recipient field at two image scales, including punctuation and visible glyphs whose PDF widths are zero. It uses spatial coverage to prefer complete readings and merges the clearest version of each physical word. Confidence is aggregated across the phrase so one uncertain proper noun does not discard the address. Readable Latin runs, house/postal numbers, SF-ID, phone and COD remain directly extracted. Successfully recovered text is marked Fixed and accepted automatically when its fields pass validation. Model confidence is a ranking signal, not a probability of correctness; automatic acceptance does not guarantee spelling accuracy. An unreadable image or unavailable model keeps the existing manual correction path.
