const BUSINESS_NAME = 'Karyo Guest Palace';
const BUSINESS_ADDRESS = [
  'After Government Girls College Doma,',
  'New Liji, Biu Road, P.O. Box 1050',
  'Gombe, Gombe State',
  '000101',
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(value) {
  const text = clean(value);
  if (!text) return '';
  return text.length > 5 ? text.slice(0, 5) : text;
}

function row(number, label, value) {
  return `<div class="row">
    <span class="no">${number}.</span>
    <span class="label">${esc(label)}</span>
    <span class="value">${esc(value) || '&nbsp;'}</span>
  </div>`;
}

/** Build an A4 Guest Report Form matching the Karyo Guest Palace report. */
export function buildGuestReportHtml(booking, logoUrl = '/logo.png') {
  const b = booking || {};
  const idProof = [clean(b.guestIdType), clean(b.guestIdDocument)]
    .filter(Boolean)
    .join(' — ');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Guest Report Form — ${esc(b.guestName || '')}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
    background: #fff;
  }
  .head { text-align: center; }
  .logo { width: 64px; height: 64px; object-fit: contain; }
  h1 {
    margin: 2px 0 0;
    font-size: 19pt;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }
  .subtitle {
    margin-top: 2px;
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  .address { margin-top: 4px; font-size: 9.5pt; line-height: 1.35; }
  .date-line {
    display: flex;
    justify-content: flex-end;
    margin: 12px 0 6px;
    font-size: 10.5pt;
  }
  .date-line .value { min-width: 55mm; border-bottom: 1px solid #000; padding: 0 4px; }
  h2 {
    margin: 14px 0 10px;
    font-size: 11.5pt;
    letter-spacing: 1px;
    text-transform: uppercase;
    border-bottom: 2px solid #000;
    padding-bottom: 3px;
  }
  .row { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 9px; }
  .row .no { width: 7mm; flex: 0 0 auto; font-weight: 700; }
  .row .label { flex: 0 0 auto; font-weight: 700; }
  .row .value {
    flex: 1 1 auto;
    min-height: 18px;
    border-bottom: 1px solid #000;
    padding: 0 4px;
    overflow-wrap: anywhere;
  }
  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14mm;
    margin-top: 18mm;
  }
  .signature { display: flex; align-items: flex-end; gap: 8px; }
  .signature .label { font-weight: 700; white-space: nowrap; }
  .signature .line { flex: 1; border-bottom: 1px solid #000; min-height: 22px; }
</style>
</head>
<body>
  <div class="head">
    <img class="logo" src="${esc(logoUrl)}" alt="Karyo Guest Palace logo" />
    <h1>${esc(BUSINESS_NAME)}</h1>
    <div class="subtitle">Guest Report Form</div>
    <div class="address">${BUSINESS_ADDRESS.map((line) => esc(line)).join('<br />')}</div>
  </div>

  <div class="date-line">
    <span>Date:&nbsp;</span>
    <span class="value">${esc(formatDate(new Date()))}</span>
  </div>

  <h2>Guest Details</h2>

  ${row(1, 'Name:', b.guestName)}
  ${row(2, 'Address:', b.guestAddress)}
  ${row(3, 'Phone No:', b.guestPhone)}
  ${row(4, 'Occupation:', b.guestOccupation)}
  ${row(5, 'Purpose of Stay:', b.stayPurpose)}
  ${row(6, 'Room No Occupied:', [clean(b.roomNumber), clean(b.roomType) ? `(${clean(b.roomType)})` : ''].filter(Boolean).join(' '))}
  ${row(7, 'Contact Phone No:', b.guestContactPhone)}
  ${row(8, 'Name of Contact (Incase of Emergency):', b.guestContactName)}
  ${row(9, 'Arrival from:', b.arrivalFrom)}
  ${row(10, 'Time of Arrival:', formatTime(b.arrivalTime))}
  ${row(11, 'Date of Arrival:', formatDate(b.checkInDate))}
  ${row(12, 'Destination:', b.destination)}
  ${row(13, 'Time of Departure:', formatTime(b.departureTime))}
    ${row(14, 'Date of Departure:', formatDate(b.departureDate))}
  ${row(15, 'Means of Identification (NIN, Voters I.D Card, Drivers License e.t.c):', idProof)}
  ${row(16, 'Vehicle No:', b.vehicleNo)}

  <div class="signatures">
    <div class="signature">
      <span class="label">17. Customer Sign/Date:</span>
      <span class="line"></span>
    </div>
    <div class="signature">
      <span class="label">18. Manager Sign/Date:</span>
      <span class="line"></span>
    </div>
  </div>
</body>
</html>`;
}

async function logoDataUrl() {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/** Send the guest report form to the browser print dialog. */
export async function printGuestReport(booking) {
  const logo = await logoDataUrl();
  const html = buildGuestReportHtml(booking, logo || '/logo.png');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const doPrint = () => {
    if (printed) return;
    printed = true;
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        setTimeout(cleanup, 1000);
      }
    }, 100);
  };

  win.onafterprint = cleanup;
  setTimeout(cleanup, 60000);

  const images = Array.from(doc.images || []);
  const imagesReady = Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          })
    )
  );
  const fontsReady = doc.fonts?.ready || Promise.resolve();
  Promise.all([imagesReady, fontsReady])
    .then(() => setTimeout(doPrint, 60))
    .catch(() => setTimeout(doPrint, 300));
}
