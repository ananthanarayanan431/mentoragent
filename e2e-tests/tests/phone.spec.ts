import { expect, screenPointOf, test, WORLD } from '../support/world'

test('@smoke on a phone: touch hint, compact quest log, tap a mentor to talk', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/v1/mentors')
  const [first] = (await response.json()) as { name: string }[]

  await page.goto('/')
  await page.getByRole('button', { name: /enter the square/i }).tap()

  await expect(page.getByText('Tap to walk · tap a mentor to talk')).toBeVisible()
  await expect(page.getByRole('button', { name: /mentors met/i })).toHaveAttribute(
    'aria-expanded',
    'false',
  )

  const point = await screenPointOf(page, WORLD.mentorSpawns[0]!)
  await page.touchscreen.tap(point.x, point.y)

  const dialog = page.getByRole('dialog', { name: `Conversation with ${first!.name}` })
  await expect(dialog).toBeVisible()
  // The header keeps room for the mentor's name on a narrow screen.
  await expect(dialog.getByRole('heading', { name: first!.name })).toBeVisible()
})
