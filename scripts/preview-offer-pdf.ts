/**
 * Generate three sample offer-letter PDFs for visual review.
 * Run: npx tsx scripts/preview-offer-pdf.ts
 *
 * Outputs:
 *   /tmp/offer-preview-unsigned.pdf         — pre-employer-sign state
 *   /tmp/offer-preview-employer-signed.pdf  — what the candidate sees during review
 *   /tmp/offer-preview-fully-signed.pdf     — final state after counter-sign
 *
 * Uses the simulator's placeholder signature PNG from lib/simulator.ts.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { encode as encodePng } from 'fast-png'
import { buildOfferPdf } from '../lib/buildOfferPdf'

/**
 * Generate a fake signature PNG with a TRANSPARENT background and a black
 * wavy line. We can't reuse the simulator's SIM_SIGNATURE_B64 here because
 * that PNG was authored for browser canvas decoding and fails fast-png's
 * strict CRC validation in Node, which is what jsPDF uses server-side.
 *
 * Transparency matters: real signatures from react-signature-canvas have
 * transparent backgrounds (canvas default + toDataURL preserves alpha).
 * If this fake PNG used a white background, it would mask the signature
 * line beneath when stamped — misrepresenting what production renders.
 */
function fakeSignaturePngBytes(): Uint8Array {
  const width = 240
  const height = 70
  const channels = 4
  const data = new Uint8Array(width * height * channels)
  // Transparent background (alpha = 0). Already zero from new Uint8Array.

  // Black wavy "signature" line
  for (let x = 10; x < width - 10; x++) {
    const y = Math.floor(height / 2 + Math.sin(x * 0.06) * 18 + Math.sin(x * 0.18) * 6)
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= height) continue
      const idx = (yy * width + x) * 4
      data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255
    }
  }
  return encodePng({ width, height, data, channels, depth: 8 })
}

const SIG_PNG_BYTES = fakeSignaturePngBytes()
const SIG_DATA_URL = `data:image/png;base64,${Buffer.from(SIG_PNG_BYTES).toString('base64')}`

const SAMPLE_BODY = `Acme Hospitality Ltd
123 High Street
London SW1A 1AA

26 April 2026

Mr John Smith
45 Park Lane
Manchester M1 2AB

Dear John,

Re: Offer of Employment — Senior Bartender

We are delighted to offer you the position of Senior Bartender at Acme Hospitality Ltd, subject to the terms and conditions set out below.

POSITION

You will be employed as a Senior Bartender, reporting to the Bar Manager. Your start date will be Monday, 8 May 2026.

REMUNERATION

Your salary will be £28,000 per annum, paid monthly in arrears by BACS transfer on the last working day of each month.

WORKING HOURS

Your normal working hours will be 40 hours per week, with shift patterns including evenings, weekends and bank holidays as required by the business.

PROBATIONARY PERIOD

Your employment will be subject to a probationary period of three months, during which either party may terminate the employment with one week's written notice.

NOTICE PERIOD

After successful completion of the probationary period, the notice period will be one month from either party.

HOLIDAY ENTITLEMENT

You will be entitled to 28 days paid holiday per year, including bank holidays.

PRE-EMPLOYMENT CHECKS

This offer is conditional on satisfactory completion of pre-employment checks, including verification of your right to work in the United Kingdom and satisfactory references.

CONFIDENTIALITY

You will be required to maintain strict confidentiality regarding all business information, customer data and operational matters during and after your employment.

We very much look forward to welcoming you to the team. If you have any questions about this offer, please don't hesitate to contact us.

Yours sincerely,`

async function writePdf(path: string, file: File) {
  mkdirSync(dirname(path), { recursive: true })
  const bytes = new Uint8Array(await file.arrayBuffer())
  writeFileSync(path, bytes)
  console.log(`✓ ${path} (${(bytes.length / 1024).toFixed(1)} KB)`)
}

async function main() {
  // Save the fake signature PNG standalone so it can be inspected for
  // transparency (right-click in any image viewer; checker pattern = transparent).
  writeFileSync('/tmp/fake-signature.png', SIG_PNG_BYTES)
  console.log(`✓ /tmp/fake-signature.png (standalone, for transparency check)`)

  const common = {
    bodyText: SAMPLE_BODY,
    companyName: 'Acme Hospitality Ltd',
    candidateName: 'John Smith',
  }

  const unsigned = await buildOfferPdf(common)
  await writePdf('/tmp/offer-preview-unsigned.pdf', unsigned.file)

  const employerSigned = await buildOfferPdf({
    ...common,
    employerSignature: {
      dataUrl: SIG_DATA_URL,
      name: 'Sarah Jenkins',
      signedAt: new Date('2026-04-26T10:00:00Z'),
    },
  })
  await writePdf('/tmp/offer-preview-employer-signed.pdf', employerSigned.file)

  const fullySigned = await buildOfferPdf({
    ...common,
    employerSignature: {
      dataUrl: SIG_DATA_URL,
      name: 'Sarah Jenkins',
      signedAt: new Date('2026-04-26T10:00:00Z'),
    },
    candidateSignature: {
      dataUrl: SIG_DATA_URL,
      name: 'John Smith',
      signedAt: new Date('2026-04-26T14:30:00Z'),
    },
  })
  await writePdf('/tmp/offer-preview-fully-signed.pdf', fullySigned.file)

  console.log('\nSlot coordinates (same for all three — deterministic):')
  console.log('  employer:', JSON.stringify(unsigned.employerSlot))
  console.log('  candidate:', JSON.stringify(unsigned.candidateSlot))
}

main().catch(err => {
  console.error('Preview generation failed:', err)
  process.exit(1)
})
