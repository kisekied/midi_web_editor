import { expect, test } from '@playwright/test'

test('creates an empty MIDI project and opens the piano roll', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()
  await expect(page.getByLabel('作品名称')).toHaveValue('未命名作品')
  await expect(page.getByRole('option', { name: /轨道 1/ })).toBeVisible()
  await expect(page.getByLabel('钢琴卷帘编辑器')).toBeVisible()
  await expect(page.getByText('中央 C · C4')).toBeVisible()
})

test('toggles and remembers all piano key pitch labels', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()

  const toggle = page.locator('.pitch-label-toggle')
  const labels = page.locator('.piano-key-label')
  await expect(toggle).toHaveAttribute('aria-label', '显示全部音高标签')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toContainText('音名：C')
  await expect(labels).toHaveCount(11)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '仅显示 C 音高标签')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText('音名：全部')
  await expect(labels).toHaveCount(128)
  await expect(labels.filter({ hasText: /^D4$/ })).toHaveCount(1)
  await expect(labels.filter({ hasText: /^C♯4$/ })).toHaveCount(1)
  await expect(labels.filter({ hasText: /^中央 C · C4$/ })).toHaveCount(1)
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('zhiyin-pitch-label-mode')))
    .toBe('all')

  await page.waitForTimeout(700)
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(labels).toHaveCount(128)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(labels).toHaveCount(11)
  await expect(labels.filter({ hasText: /^D4$/ })).toHaveCount(0)
  await expect(labels.filter({ hasText: /^C♯4$/ })).toHaveCount(0)
})

test('pastes immediately after the last edited note instead of at the playhead', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()

  const grid = page.getByRole('grid', { name: '音符网格' })
  const scroll = await page.locator('.piano-scroll').evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }))
  await grid.dblclick({ position: { x: scroll.left + 240, y: scroll.top + 180 } })
  const original = page.locator('.midi-note').first()
  const originalLabel = await original.getAttribute('aria-label')
  const match = originalLabel?.match(/tick (\d+)，时值 (\d+)/)
  expect(match).not.toBeNull()
  const expectedPasteTick = Number(match?.[1]) + Number(match?.[2])

  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+v')

  await expect(page.locator('.midi-note')).toHaveCount(2)
  await expect(page.locator(`.midi-note[aria-label*="tick ${expectedPasteTick}"]`)).toHaveCount(1)

  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('.midi-note')).toHaveCount(3)
  const expectedNextTick = expectedPasteTick + Number(match?.[2])
  await expect(page.locator(`.midi-note[aria-label*="tick ${expectedNextTick}"]`)).toHaveCount(1)
})

test('drags the playhead line to a new timeline position', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()

  const ruler = page.getByRole('slider', { name: /时间标尺/ })
  await ruler.click({ position: { x: 100, y: 15 } })
  const playhead = page.getByRole('slider', { name: '播放头；拖动定位' })
  const beforeTick = Number(await playhead.getAttribute('aria-valuenow'))
  const lineBox = await playhead.boundingBox()
  const scrollBox = await page.locator('.piano-scroll').boundingBox()
  expect(lineBox).not.toBeNull()
  expect(scrollBox).not.toBeNull()
  if (!lineBox || !scrollBox) return

  await page.mouse.move(lineBox.x + lineBox.width / 2, scrollBox.y + 80)
  await page.mouse.down()
  await page.mouse.move(lineBox.x + lineBox.width / 2 + 100, scrollBox.y + 80, { steps: 5 })
  await page.mouse.up()

  await expect
    .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
    .toBeGreaterThan(beforeTick)
  await expect(page.locator('.midi-note')).toHaveCount(0)
})

test('highlights mute and solo buttons according to their pressed state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()

  const mute = page.locator('.track-toggle.is-mute')
  const solo = page.locator('.track-toggle.is-solo')
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await expect(solo).toHaveAttribute('aria-pressed', 'false')
  const idleMuteBackground = await mute.evaluate((element) => getComputedStyle(element).background)
  const idleSoloBackground = await solo.evaluate((element) => getComputedStyle(element).background)

  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect(mute).toHaveClass(/is-on/)
  await expect(mute).toHaveAttribute('aria-label', /取消静音/)
  await expect
    .poll(async () => mute.evaluate((element) => getComputedStyle(element).background))
    .not.toBe(idleMuteBackground)

  await solo.click()
  await expect(solo).toHaveAttribute('aria-pressed', 'true')
  await expect(solo).toHaveClass(/is-on/)
  await expect(solo).toHaveAttribute('aria-label', /取消独奏/)
  await expect
    .poll(async () => solo.evaluate((element) => getComputedStyle(element).background))
    .not.toBe(idleSoloBackground)

  await mute.click()
  await solo.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await expect(solo).toHaveAttribute('aria-pressed', 'false')
})

test('follows the playhead by scrolling the piano roll during playback', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()

  const pianoScroll = page.locator('.piano-scroll')
  const viewport = await pianoScroll.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
    width: element.clientWidth,
  }))
  const grid = page.getByRole('grid', { name: '音符网格' })
  await grid.dblclick({
    position: {
      x: viewport.left + viewport.width - 60,
      y: viewport.top + 180,
    },
  })

  const ruler = page.getByRole('slider', { name: /时间标尺/ })
  await ruler.click({ position: { x: viewport.width - 240, y: 15 } })
  const initialScrollLeft = await pianoScroll.evaluate((element) => element.scrollLeft)
  await page.getByRole('button', { name: '播放（空格）' }).click()
  await expect(page.getByRole('button', { name: '暂停（空格）' })).toBeVisible()

  await expect
    .poll(async () => pianoScroll.evaluate((element) => element.scrollLeft), { timeout: 5000 })
    .toBeGreaterThan(initialScrollLeft + 5)

  await page.getByRole('button', { name: '暂停（空格）' }).click()
})
