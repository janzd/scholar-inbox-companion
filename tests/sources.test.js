import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {sourcePlan, readDocument, paperMetadata, fetchPublic} from '../extension/sources.js';
import {readPdf, titleFromItems} from '../extension/pdf.js';

test('known PDF URLs resolve to the corresponding landing page', () => {
  const cases = [
    ['https://arxiv.org/pdf/2609.04649v3', 'https://arxiv.org/abs/2609.04649'],
    ['https://openaccess.thecvf.com/content/CVPR2024/papers/Huang_Segment_and_Caption_Anything_CVPR_2024_paper.pdf', 'https://openaccess.thecvf.com/content/CVPR2024/html/Huang_Segment_and_Caption_Anything_CVPR_2024_paper.html'],
    ['https://openaccess.thecvf.com/content_cvpr_2017/papers/Example.pdf', 'https://openaccess.thecvf.com/content_cvpr_2017/html/Example.html'],
    ['https://openreview.net/pdf?id=YicbFdNTTy#page=2', 'https://openreview.net/forum?id=YicbFdNTTy']
  ];
  for (const [input, expected] of cases) assert.equal(sourcePlan(input).landingUrl, expected);
  assert.equal(sourcePlan('https://example.org/paper.PDF#page=3').isPdf, true);
  for (const value of ['file:///paper.pdf', 'chrome://extensions', 'data:text/html,test', 'https://user:secret@example.org/paper.pdf']) assert.equal(sourcePlan(value).supported, false);
  assert.equal(sourcePlan('https://openreview.net.evil.test/pdf?id=123').landingUrl, undefined);
});

test('CVF citation metadata and selector fallback identify the title', () => {
  // Minimal fixture from the official CVPR 2024 Segment and Caption Anything page.
  const {document} = parseHTML('<meta name="citation_title" content="Segment and Caption Anything"><meta name="citation_author" content="Huang, Xiaoke"><meta name="citation_author" content="Wang, Jianfeng"><meta name="citation_publication_date" content="2024"><div id="papertitle"> Segment and Caption Anything </div>');
  const metadata = paperMetadata(readDocument(document), sourcePlan('https://openaccess.thecvf.com/content/CVPR2024/html/example.html'));
  assert.equal(metadata.title, 'Segment and Caption Anything'); assert.equal(metadata.year, '2024');
  assert.deepEqual(metadata.authors, ['Huang, Xiaoke', 'Wang, Jianfeng']);
  document.querySelector('meta[name="citation_title"]').remove();
  assert.equal(readDocument(document).title, metadata.title);
});

test('OpenReview rendered heading works without citation tags; verification pages do not trigger search', () => {
  const {document} = parseHTML('<h2 class="citation title"> A Paper\n About Learning </h2>');
  assert.equal(readDocument(document).title, 'A Paper About Learning');
  const challenge = parseHTML('<html><head><title>Verifying your browser | OpenReview</title></head><body></body></html>').document;
  assert.equal(readDocument(challenge).title, '');
});

test('generic metadata is bounded and cross-origin PDF links are not fetched', () => {
  const {document} = parseHTML('<meta name="DC.Title" content="A &amp; B"><meta name="citation_doi" content="https://doi.org/10.1234/AbC"><meta name="citation_pdf_url" content="/download"><script>secret()</script><p>private page body</p>');
  let metadata = paperMetadata(readDocument(document), sourcePlan('https://publisher.example/article'));
  assert.equal(metadata.title, 'A & B'); assert.equal(metadata.doi, '10.1234/abc'); assert.equal(metadata.pdfUrl, 'https://publisher.example/download');
  assert.ok(!JSON.stringify(metadata).includes('private page body'));
  document.querySelector('[name="citation_pdf_url"]').setAttribute('content', 'https://elsewhere.example/file.pdf');
  assert.equal(paperMetadata(readDocument(document), sourcePlan('https://publisher.example/article')).pdfUrl, '');
});

test('public downloads omit credentials, refuse redirects and enforce streamed size limits', async () => {
  const bytes = await fetchPublic('https://publisher.example/paper.pdf', {fetchFn: async (_, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); return new Response('test');
  }});
  assert.equal(new TextDecoder().decode(bytes), 'test');
  await assert.rejects(fetchPublic('https://publisher.example/paper.pdf', {maxBytes: 3, fetchFn: async () => new Response('long')}), /too large/);
  await assert.rejects(fetchPublic('https://publisher.example/paper.pdf', {fetchFn: async () => new Response('', {status: 403})}), /403/);
  await assert.rejects(fetchPublic('file:///paper.pdf'), /cannot be downloaded/);
});

test('PDF title heuristic joins large title lines and ignores body text and watermarks', () => {
  const item = (str, size, x, y, rotate = 0) => ({str, height: size, transform: [size, rotate, 0, size, x, y]});
  const items = [item('A Useful Paper', 20, 50, 700), item('About Learning', 20, 50, 675), item('Author Names', 12, 50, 640), item('arXiv watermark', 22, 10, 700, 22), item('Body heading', 20, 50, 180)];
  assert.equal(titleFromItems(items), 'A Useful Paper About Learning');
  assert.equal(titleFromItems([]), '');
});

function samplePdf({withTitle = true, text = 'A Useful Paper About Learning'} = {}) {
  // A generated, single-page text PDF, with no third-party paper content.
  const stream = `BT /F1 20 Tf 50 700 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< ${withTitle ? '/Title (A Useful Paper About Learning)' : ''} /Author (Example Author) >>`];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(result.length); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = result.length;
  result += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(result);
}

test('bundled PDF.js reads real PDF metadata and first-page text locally', async () => {
  // Browser-native APIs for the same vendored module under Node (no rendering).
  const {DOMMatrix, ImageData, Path2D} = await import('@napi-rs/canvas');
  Object.assign(globalThis, {DOMMatrix, ImageData, Path2D});
  for (const withTitle of [true, false]) {
    const result = await readPdf(samplePdf({withTitle}));
    assert.equal(result.title, 'A Useful Paper About Learning'); assert.equal(result.authors, 'Example Author');
  }
  assert.equal((await readPdf(samplePdf({withTitle: false, text: ''}))).title, '');
  await assert.rejects(readPdf(new TextEncoder().encode('<html>Sign in</html>')), /web page instead/);
  await assert.rejects(readPdf(new Uint8Array(26 * 1024 * 1024)), /25 MB/);
  await assert.rejects(readPdf(new TextEncoder().encode('%PDF-1.4\nbroken file')));
});
