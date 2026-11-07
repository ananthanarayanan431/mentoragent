import AxeBuilder from '@axe-core/playwright'

import {
  announcement,
  enterSquare,
  expect,
  screenPointOf,
  test,
  walkToAMentor,
  WORLD,
} from '../support/world'

interface Mentor {
  id: string
  name: string
}

async function mentorsFromApi(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/v1/mentors')
  expect(response.ok()).toBe(true)
  return ((await response.json()) as Mentor[]).slice(0, WORLD.mentorSpawns.length)
}

test('@smoke opens on the square with every mentor in the quest log', async ({ page, request }) => {
  const mentors = await mentorsFromApi(request)
  expect(mentors.length, 'seed the mentors first: mentor-agent load-mentors').toBeGreaterThan(0)

  await page.goto('/')
  await expect(
    page.getByText(new RegExp(`${mentors.length} mentors? (is|are) strolling`)),
  ).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)

  await page.getByRole('button', { name: /enter the square/i }).click()
  const log = page.getByRole('complementary', { name: 'Mentors met' })
  await expect(log).toContainText(`0/${mentors.length}`)
  for (const mentor of mentors) await expect(log).toContainText(mentor.name)
})

test('walk up to a mentor, talk, and walk away again', async ({ page }) => {
  await enterSquare(page)

  const nearby = await walkToAMentor(page)
  const name = nearby.replace(/ is next to you\..*$/, '')
  expect(nearby).toMatch(/is next to you\. Press Space to talk\.$/)

  await page.keyboard.press('Space')
  const dialog = page.getByRole('dialog', { name: `Conversation with ${name}` })
  await expect(dialog).toBeVisible()
  const input = page.getByRole('textbox', { name: `Message ${name}` })
  await expect(input).toBeFocused()
  // The Space that opened the dialogue is not typed into it, and WASD are letters here.
  await expect(input).toHaveValue('')
  await page.keyboard.type('Was it worth it, sadly?')
  await expect(input).toHaveValue('Was it worth it, sadly?')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // Still standing next to the same mentor: typing did not move the player.
  await expect(announcement(page)).toHaveText(nearby)

  // Control is back: walking away leaves them out of reach.
  await page.keyboard.down('ArrowDown')
  await expect(announcement(page)).toHaveText('', { timeout: 5_000 })
  await page.keyboard.up('ArrowDown')
})

test('click a mentor to walk over and talk', async ({ page, request }) => {
  const [first] = await mentorsFromApi(request)
  await enterSquare(page)

  // Mentors idle at their spawn for a moment first, so the first spot holds the first mentor.
  const point = await screenPointOf(page, WORLD.mentorSpawns[0]!)
  await page.mouse.click(point.x, point.y)

  await expect(page.getByRole('dialog', { name: `Conversation with ${first!.name}` })).toBeVisible()
})

test('pause menu: labels toggle and resume', async ({ page }) => {
  await enterSquare(page)

  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Paused' })
  await expect(pause).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused()

  const labels = page.getByRole('button', { name: /name labels/i })
  await expect(labels).toHaveAttribute('aria-pressed', 'true')
  await labels.click()
  await expect(labels).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(pause).toBeHidden()
  // Moving works again after resuming.
  await walkToAMentor(page)
})

test('classic view and back: the game is removed, then rebuilt', async ({ page, request }) => {
  const mentors = await mentorsFromApi(request)
  await enterSquare(page)

  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: 'Mentors' })
    .click()
  await expect(page).toHaveURL(/\/mentors$/)
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.getByText(mentors[0]!.name).first()).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: 'Square' })
    .click()
  await expect(page.getByRole('button', { name: /enter the square/i })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)
})

test('menus and the dialogue have no serious accessibility violations', async ({
  page,
  consoleErrors,
}) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page }).exclude('canvas').analyze()
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
  }

  await page.goto('/')
  await page.getByRole('button', { name: /enter the square/i }).waitFor()
  expect(await scan(), 'title screen').toEqual([])

  await page.getByRole('button', { name: /enter the square/i }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Paused' }).waitFor()
  expect(await scan(), 'pause menu').toEqual([])

  await page.getByRole('button', { name: 'Resume' }).click()
  await walkToAMentor(page)
  await page.keyboard.press('Space')
  await page.getByRole('dialog', { name: /conversation with/i }).waitFor()
  expect(await scan(), 'dialogue').toEqual([])

  // axe fetches stylesheets to analyse them; the app's CSP rightly blocks the
  // cross-origin font CSS. That is the scanner, not the app, so drop only that.
  const fromAxe =
    /fonts\.googleapis\.com.*violates the following Content Security Policy directive: "connect-src/
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !fromAxe.test(e)))
})
