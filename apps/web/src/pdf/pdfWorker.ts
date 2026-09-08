import * as pdfjs from 'pdfjs-dist';
// The `?url` form is the one that works reliably under Vite. Getting this
// wrong produces a silent hang with no error — if a PDF never renders, this
// is the first thing to check.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
