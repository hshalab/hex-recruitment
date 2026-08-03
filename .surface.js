const fs = require('fs')
const p = 'app/post-job/page.tsx'
let s = fs.readFileSync(p, 'utf8')

// The h3 above the card already says what the step is; a second emoji heading
// inside it is chrome the handoff doesn't have. Kept for the edit path, which
// still renders the long single form and needs its section markers.
const hide = (icon, label) => {
  const from = `            <h2 className={styles.sectionTitle}>\n              <span className={styles.sectionIcon}>${icon}</span>\n              ${label}\n            </h2>`
  const to = `            {!stepped && (\n            <h2 className={styles.sectionTitle}>\n              <span className={styles.sectionIcon}>${icon}</span>\n              ${label}\n            </h2>\n            )}`
  if (!s.includes(from)) { console.error('MISS: ' + label); process.exit(1) }
  s = s.replace(from, to)
}
hide('💼', 'Job Details')
hide('ℹ️', 'Requirements &amp; Details')

// The step-3 pair get handoff headings instead of emoji ones.
const swap = (icon, label, heading) => {
  const from = `            <h2 className={styles.sectionTitle}>\n              <span className={styles.sectionIcon}>${icon}</span>\n              ${label}\n            </h2>`
  const to = `            {stepped ? (\n              <h3 className={flow.extrasHeading}>${heading}</h3>\n            ) : (\n            <h2 className={styles.sectionTitle}>\n              <span className={styles.sectionIcon}>${icon}</span>\n              ${label}\n            </h2>\n            )}`
  if (!s.includes(from)) { console.error('MISS: ' + label); process.exit(1) }
  s = s.replace(from, to)
}
swap('❓', 'Pre-screening Questions (optional)', 'Ask one screening question')
swap('🏷️', 'Job Tags', 'Tag the role')

fs.writeFileSync(p, s)
console.log('surface applied')
