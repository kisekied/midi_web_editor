import { expect, test } from '@playwright/test'

test('creates an empty MIDI project and opens the piano roll', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '创建空白 MIDI' }).click()
  await expect(page.getByLabel('作品名称')).toHaveValue('未命名作品')
  await expect(page.getByRole('option', { name: /轨道 1/ })).toBeVisible()
  await expect(page.getByLabel('钢琴卷帘编辑器')).toBeVisible()
})
