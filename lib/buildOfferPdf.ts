/**
 * Builds the offer letter PDF from AI-generated body text + an appended,
 * deterministic signature block. The block always renders both employer and
 * candidate sub-blocks; either or both can be stamped with a signature image
 * by passing employerSignature / candidateSignature.
 *
 * Signature slot coordinates are computed from layout constants — never
 * detected from text — and returned for persistence on job_offers. The
 * persisted slots aren't used by the signing flow itself (counter-signing
 * just rebuilds the PDF from the stored body text + both sigs); they exist
 * for forensics and future overdraws like rescind watermarks.
 */

import type { jsPDF as JsPDFType } from 'jspdf'

const PAGE_HEIGHT_MM = 297
const MARGIN_MM = 20
const BODY_FONT_SIZE = 11
const BODY_LINE_HEIGHT_MM = 6
const PAGE_BREAK_Y_MM = 270

const SIG_BLOCK_HEIGHT_MM = 80
const BREATHING_ROOM_MM = 30
const SIG_LINE_WIDTH_MM = 80
const SIG_LINE_THICKNESS_MM = 0.5
const SIG_IMG_WIDTH_MM = 60
const SIG_IMG_HEIGHT_MM = 16
const CAPTION_TO_IMAGE_GAP_MM = 5
const LINE_TO_NAME_GAP_MM = 7
const NAME_TO_DATE_GAP_MM = 5
const SUB_BLOCK_SPACER_MM = 12

export interface SignatureSlot {
  page: number
  x_mm: number
  y_mm: number
  width_mm: number
  page_height_mm: number
}

export interface SignatureData {
  /** PNG data URL (e.g. from a canvas signature pad) */
  dataUrl: string
  /** Typed name */
  name: string
  /** Defaults to now */
  signedAt?: Date
}

export interface BuildOfferPdfOpts {
  bodyText: string
  companyName: string
  candidateName: string
  fileName?: string
  employerSignature?: SignatureData
  candidateSignature?: SignatureData
}

export interface BuildOfferPdfResult {
  file: File
  employerSlot: SignatureSlot
  candidateSlot: SignatureSlot
}

function formatUKDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function drawSignatureSubBlock(
  doc: JsPDFType,
  yStart: number,
  heading: string,
  signature: SignatureData | undefined,
): { newY: number; slot: SignatureSlot } {
  // Caption (text baseline at yStart)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(heading, MARGIN_MM, yStart)
  doc.setFont('helvetica', 'normal')

  // Signature image sits in the gap between caption and the line.
  // Image bottom == lineY so the image rests on the line.
  const imageTopY = yStart + CAPTION_TO_IMAGE_GAP_MM
  const lineY = imageTopY + SIG_IMG_HEIGHT_MM

  // Always draw the visible signature line, regardless of whether a
  // signature is being stamped — reviewers need to see WHERE it goes.
  // Explicit thickness because jsPDF's default 0.2mm is hairline-thin
  // and disappears at viewer zoom.
  const prevLineWidth = doc.getLineWidth()
  doc.setLineWidth(SIG_LINE_THICKNESS_MM)
  doc.line(MARGIN_MM, lineY, MARGIN_MM + SIG_LINE_WIDTH_MM, lineY)
  doc.setLineWidth(prevLineWidth)

  if (signature) {
    doc.addImage(
      signature.dataUrl,
      'PNG',
      MARGIN_MM,
      imageTopY,
      SIG_IMG_WIDTH_MM,
      SIG_IMG_HEIGHT_MM,
    )
  }

  const slot: SignatureSlot = {
    page: doc.getCurrentPageInfo().pageNumber,
    x_mm: MARGIN_MM,
    y_mm: lineY,
    width_mm: SIG_LINE_WIDTH_MM,
    page_height_mm: PAGE_HEIGHT_MM,
  }

  // Name + Date below the line
  doc.setFontSize(9)
  let y = lineY + LINE_TO_NAME_GAP_MM
  const name = signature?.name || '________________________'
  const date = signature
    ? formatUKDate(signature.signedAt || new Date())
    : '________________________'
  doc.text(`Name: ${name}`, MARGIN_MM, y)
  y += NAME_TO_DATE_GAP_MM
  doc.text(`Date: ${date}`, MARGIN_MM, y)

  return { newY: y, slot }
}

export async function buildOfferPdf(opts: BuildOfferPdfOpts): Promise<BuildOfferPdfResult> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth() - MARGIN_MM * 2

  doc.setFontSize(BODY_FONT_SIZE)
  doc.setFont('helvetica', 'normal')
  const lines: string[] = doc.splitTextToSize(opts.bodyText, pageWidth)
  let y = MARGIN_MM
  for (const line of lines) {
    if (y > PAGE_BREAK_Y_MM) { doc.addPage(); y = MARGIN_MM }
    doc.text(line, MARGIN_MM, y)
    y += BODY_LINE_HEIGHT_MM
  }

  const remaining = PAGE_BREAK_Y_MM - y
  if (remaining < SIG_BLOCK_HEIGHT_MM + BREATHING_ROOM_MM) {
    doc.addPage()
    y = MARGIN_MM
  } else {
    y += BREATHING_ROOM_MM
  }

  const employer = drawSignatureSubBlock(
    doc, y,
    `Signed by Authorised Representative of ${opts.companyName}:`,
    opts.employerSignature,
  )
  y = employer.newY + SUB_BLOCK_SPACER_MM

  const candidate = drawSignatureSubBlock(
    doc, y,
    `Counter-signed by Candidate (${opts.candidateName}):`,
    opts.candidateSignature,
  )

  const blob = doc.output('blob')
  const fileName = opts.fileName
    || `Offer-Letter-${opts.candidateName.replace(/\s+/g, '-')}.pdf`
  const file = new File([blob], fileName, { type: 'application/pdf' })

  return { file, employerSlot: employer.slot, candidateSlot: candidate.slot }
}
