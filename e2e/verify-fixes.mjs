// Playwright check for the Oct 10 fixes (docs/10-verification.md): edit requests in Ask and Q2.
// Drives the real UI against a running backend + Vite, asserts the behaviour, and saves annotated
// screenshots to docs/verification/<phase>-*.png.
//
//   node verify-fixes.mjs --phase before   # on the old code: records what happens, never fails
//   node verify-fixes.mjs --phase after    # on the fixed code: exits 1 if any check fails
//
// Env: TALAAN_UI (default http://localhost:5180), TALAAN_API (default http://127.0.0.1:8010).
// Run against freshly seeded demo data (uv run python scripts/seed_demo.py --reset): it edits
// 2026-10-02_open-items.md in Case 2026-014.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const UI = process.env.TALAAN_UI ?? 'http://localhost:5180'
const API = process.env.TALAAN_API ?? 'http://127.0.0.1:8010'
const phase = process.argv[process.argv.indexOf('--phase') + 1] ?? 'after'
const strict = phase === 'after'
const OUT = fileURLToPath(new URL('../docs/verification/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const CASE = 'Case-2026-014_Dela-Cruz'
const EDIT_Q = 'Edit the open items to mark the request for copies as done.'
const Q2 = 'Is there anything in this case that contradicts the allegation?'
// Same keyword groups as backend/scripts/acceptance.py, plus "agency" on its own (demo-data README)
const Q2_POINTS = [
  ['sick leave', /sick leave/i],
  ['medical certificate', /medical cert/i],
  ['no badge entry', /badge/i],
  ['face not identifiable', /identif|face/i],
  ['unnamed agency helpers', /agency/i],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const vis = (l) => l.filter({ visible: true }).first()
const tab = (name) => vis(page.getByRole('tab', { name })).click()
const results = []
const record = (id, ok, note) => { results.push({ id, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${note}`) }

/** Draw a labelled box around each target, plus a phase banner, then screenshot. */
async function shot(name, marks, caption) {
  const boxes = []
  for (const m of marks) {
    const b = await m.locator.boundingBox()
    if (b) boxes.push({ ...b, text: m.text, ok: m.ok })
  }
  await page.evaluate(({ boxes, caption, phase }) => {
    document.querySelectorAll('.pw-annot').forEach((n) => n.remove())
    const add = (css, text = '') => {
      const d = document.createElement('div')
      d.className = 'pw-annot'
      d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;font:600 13px/1.35 system-ui,sans-serif;white-space:pre-line;${css}`
      d.textContent = text
      document.body.appendChild(d)
    }
    const tone = phase === 'before' ? '#b91c1c' : '#15803d'
    add(`left:0;right:0;top:0;padding:6px 12px;background:${tone};color:#fff;font-size:14px`,
      `${phase.toUpperCase()}: ${caption}`)
    for (const b of boxes) {
      const c = b.ok === false ? '#dc2626' : b.ok === true ? '#16a34a' : '#2563eb'
      add(`left:${b.x - 4}px;top:${b.y - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid ${c};border-radius:8px`)
      // Label to the left of the box when there is room (the right-hand panel), else above it
      const left = b.x > 420
      const pos = left ? `left:${b.x - 392}px;top:${Math.max(36, b.y)}px;width:370px`
        : `left:${Math.max(8, b.x + b.width - 370)}px;bottom:${innerHeight - b.y + 8}px;max-width:370px`
      add(`${pos};padding:6px 9px;background:${c};color:#fff;border-radius:6px;box-shadow:0 2px 8px #0003`, b.text)
    }
  }, { boxes, caption, phase })
  await page.screenshot({ path: `${OUT}${phase}-${name}.png` })
  await page.evaluate(() => document.querySelectorAll('.pw-annot').forEach((n) => n.remove()))
}

async function ask(q) {
  await tab('Ask')
  const box = vis(page.getByRole('textbox', { name: /Ask about this/ }))
  await box.fill(q)
  const resp = page.waitForResponse((r) => r.url().includes('/ask') && r.request().method() === 'POST', { timeout: 300_000 })
  await box.press('Enter')
  const body = await (await resp).json()
  await page.waitForTimeout(600)
  return body
}
const lastAnswer = () => vis(page.locator('div.rounded-xl.bg-white.px-3.py-2').last())
const openCase = async () => { await page.goto(`${UI}/folders/${CASE}`); await page.waitForLoadState('networkidle') }

// 1 · An edit request becomes a propose_edit that waits for approval, and approving it writes the file
await openCase()
const edit = await ask(EDIT_Q)
const o = edit.outcome ?? {}
const isEdit = o.action === 'propose_edit' && o.status === 'pending'
record('edit-proposed', isEdit, `outcome ${o.status} ${o.action} ${o.path ?? ''}: "${edit.answer}"`)
await shot('edit-ask', [
  { locator: vis(page.getByText(EDIT_Q)), text: 'Asked to EDIT an existing file' },
  { locator: lastAnswer(), ok: isEdit, text: isEdit
      ? 'propose_edit on 2026-10-02_open-items.md, waiting for approval'
      : `Model chose "${o.action}", no edit proposed` },
], 'edit request in the Ask panel')

if (isEdit) {
  await vis(page.getByText(/Waiting for your approval/)).click()
  await page.waitForTimeout(600)
  await vis(page.getByLabel(`Select ${o.path}`)).locator('..').click({ position: { x: 200, y: 10 } })
  await page.waitForTimeout(400)
  const diff = vis(page.locator('pre, div').filter({ hasText: /^\s*[-+ ] /m }).filter({ has: page.getByText(/Respond to Atty\. Ramos/) }).last())
  const preview = await vis(page.getByText(/^preview/i)).locator('..').innerText()
  const diffOk = /- - \[ \] Respond to Atty\. Ramos/.test(preview) && /\+ - \[x\] Respond to Atty\. Ramos/.test(preview)
  record('edit-diff', diffOk, diffOk ? 'diff shows "[ ]" removed and "[x]" added' : 'diff does not show the checkbox change')
  await shot('edit-diff', [
    { locator: diff, ok: diffOk, text: 'Diff: the "request for copies" item goes from [ ] to [x]; nothing else changes' },
    { locator: vis(page.getByRole('button', { name: /^Approve this$/ })), text: 'Nothing is written until the user approves' },
  ], 'proposed edit shown as a diff in Approvals')

  const dec = page.waitForResponse((r) => /\/proposals\/.+\/approve/.test(r.url()))
  await vis(page.getByRole('button', { name: /^Approve this$/ })).click()
  await dec
  const text = await (await fetch(`${API}/folders/${CASE}/files/${o.path}`)).text()
  const written = text.includes('[x] Respond to Atty. Ramos')
  const audit = await (await fetch(`${API}/folders/${CASE}/audit`)).json()
  const executed = audit.some((e) => e.event === 'executed' && e.action === 'propose_edit')
  record('edit-approved', written && executed, `file updated: ${written}; audit "executed propose_edit": ${executed}`)
  await vis(page.getByRole('button', { name: '2026-10-02 · Open items' })).click()
  await page.waitForTimeout(600)
  await tab('Audit')
  await page.waitForTimeout(600)
  await shot('edit-approved', [
    { locator: vis(page.locator('article li').filter({ hasText: 'Respond to Atty. Ramos' })), ok: written, text: 'File on disk now has the item checked' },
    { locator: vis(page.locator('tbody tr').filter({ hasText: /executed/ }).filter({ hasText: /propose edit/ })), ok: executed, text: 'Audit: proposed → needs approval → approved → executed' },
  ], 'after approving the edit')
} else {
  record('edit-diff', false, 'skipped: no edit was proposed')
  record('edit-approved', false, 'skipped: no edit was proposed')
}

// 2 · Q2 lists every contradicting point, each with a source, and does not decide
await openCase()
const q2 = await ask(Q2)
const found = Q2_POINTS.map(([label, re]) => [label, re.test(q2.answer)])
const missing = found.filter(([, ok]) => !ok).map(([l]) => l)
const decides = /\b(is guilty|is innocent|did not (steal|take)|cleared)\b/i.test(q2.answer)
const markdown = /\*\*|^\s*[*-] /m.test(q2.answer)
record('q2-coverage', !missing.length && !decides && q2.sources.length > 0,
  `${found.length - missing.length}/${found.length} points${missing.length ? `, missing: ${missing.join(', ')}` : ''}; ${q2.sources.length} sources; decides: ${decides}`)
record('q2-plain-text', !markdown, markdown ? 'answer contains raw Markdown (** or * bullets)' : 'no raw Markdown')
await shot('q2', [
  { locator: lastAnswer(), ok: !missing.length,
    text: found.map(([l, ok]) => `${ok ? '✓' : '✗'} ${l}`).join('\n') + (markdown ? '\n✗ raw Markdown (** / *) shown to the user' : '\n✓ plain sentences, no raw Markdown') },
], 'Q2 "Is there anything in this case that contradicts the allegation?"')

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed (${phase}); images in docs/verification/`)
if (strict && failed.length) process.exit(1)
