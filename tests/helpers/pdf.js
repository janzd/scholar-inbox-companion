export function samplePdf({withTitle = true, text = 'A Useful Paper About Learning'} = {}) {
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
