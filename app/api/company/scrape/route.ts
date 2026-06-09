import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const rawUrl: string = body?.url || ''

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    } catch {
      return NextResponse.json({ error: 'Please enter a valid URL' }, { status: 400 })
    }

    if (!FIRECRAWL_API_KEY) {
      return NextResponse.json({ error: 'Firecrawl is not configured' }, { status: 500 })
    }
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI extraction is not configured' }, { status: 500 })
    }

    // 1. Scrape with Firecrawl
    const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: parsedUrl.toString(),
        formats: ['markdown', 'links', 'rawHtml'],
        onlyMainContent: false,
      }),
    })

    if (!scrapeRes.ok) {
      const text = await scrapeRes.text().catch(() => '')
      console.error('[company/scrape] firecrawl failed', scrapeRes.status, text)
      return NextResponse.json(
        { error: `Couldn't scrape that URL (${scrapeRes.status})` },
        { status: 502 }
      )
    }

    const scrapeData = await scrapeRes.json()
    const markdown: string = scrapeData?.data?.markdown || ''
    const links: string[] = (scrapeData?.data?.links || []).map((l: any) => typeof l === 'string' ? l : l?.url || '').filter(Boolean)

    if (!markdown || markdown.length < 50) {
      return NextResponse.json(
        { error: "Couldn't find enough content on that page" },
        { status: 422 }
      )
    }

    // NOTE: we deliberately do NOT extract a logo here. A scraped logo is a
    // hotlinked favicon/og:image hosted on the third party's server — low
    // quality and liable to silently break if they remove or block it — so the
    // company logo is upload-only, not auto-imported.

    // Truncate to avoid blowing the context window on a huge page
    const truncatedMarkdown = markdown.slice(0, 6000)
    const linksStr = links.slice(0, 50).join('\n')

    // 2. Extract structured data via Claude
    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Extract company information from this webpage content. Return ONLY a JSON object with these fields (use null for any you can't find):
{
  "companyName": "string",
  "description": "string (2-3 sentence summary of what the company does, professional tone)",
  "location": "string (city and country if found)",
  "website": "string (the original URL)",
  "industry": "string or null (the company's primary industry sector — e.g. Technology, Healthcare, Finance, Retail, Hospitality, Manufacturing, Education, Construction, Energy, Marketing, Media, Legal, Transport, etc.)",
  "companySize": "string or null (number of employees if mentioned — return as a range like '1-10', '11-50', '51-200', '201-500', '501-1000', or '1000+')"
}

Page URL: ${parsedUrl.toString()}

Page content:
${truncatedMarkdown}

Links found on the page:
${linksStr}`,
          },
        ],
      }),
    })

    if (!extractRes.ok) {
      const text = await extractRes.text().catch(() => '')
      console.error('[company/scrape] claude failed', extractRes.status, text)
      return NextResponse.json(
        { error: 'AI extraction failed — please try again' },
        { status: 502 }
      )
    }

    const extractData = await extractRes.json()
    const responseText: string = extractData?.content?.[0]?.text || ''

    // Parse the JSON from Claude's response (it may wrap in ```json ... ```)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Couldn't extract company information from that page" },
        { status: 422 }
      )
    }

    let extracted: Record<string, any>
    try {
      extracted = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json(
        { error: "Couldn't parse extracted data" },
        { status: 422 }
      )
    }

    // Ensure website field is set even if Claude didn't return it
    if (!extracted.website) {
      extracted.website = parsedUrl.toString()
    }

    // Never return a scraped logo — logos are upload-only (see note above).
    delete extracted.logoUrl

    return NextResponse.json({ data: extracted })
  } catch (err: any) {
    console.error('[company/scrape] error', err)
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}
