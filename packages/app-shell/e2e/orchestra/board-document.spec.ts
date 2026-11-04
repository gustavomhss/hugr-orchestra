import path from "node:path"
import { expect, test } from "@playwright/test"

// Uses Vite source URLs; the Bun CI wrapper below runs this explicitly. Not a production-server smoke test.
test("original execution source, resource-free Markdown and platform-owned primary/middle links @development-only", async ({ page, context }) => {
  const body = '# Heading\n\n![pixel](https://untrusted.invalid/pixel.png)\n<img src="https://untrusted.invalid/track">\n<video src="https://untrusted.invalid/movie"></video>\n<script>literal example</script>\n[Web](https://example.com) [Mail](mailto:a@example.com) [Local](../file)'
  const requests: string[] = []
  await page.route("https://untrusted.invalid/**", (route) => {
    requests.push(route.request().url())
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' })
  })
  await page.route("**/__board_document", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Reader regression</title></head><body><main id="fixture"></main></body></html>' }))
  await page.goto("/__board_document")

  // Positive control: the network oracle must see a real image before an empty request list means anything.
  const control = page.waitForResponse("https://untrusted.invalid/control.svg")
  await page.evaluate(() => {
    const image = document.createElement("img")
    image.src = "https://untrusted.invalid/control.svg"
    document.body.append(image)
  })
  await control
  expect(requests).toEqual(["https://untrusted.invalid/control.svg"])
  requests.splice(0)
  await page.locator('img[src="https://untrusted.invalid/control.svg"]').evaluate((image) => image.remove())

  await page.evaluate(async ({ url, body }) => {
    const fixture = await import(/* @vite-ignore */ url)
    fixture.mount(document.getElementById("fixture"), body)
  }, { url: `/@fs${path.resolve(import.meta.dirname, "../../test-browser/board-document.fixture.tsx")}`, body })
  const root = page.locator("#fixture")
  await root.getByRole("button", { name: "Read Brief by backend, 1", exact: true }).click()
  const reader = root.getByRole("region", { name: "Read Brief by backend, 1", exact: true })
  await expect(reader.getByRole("heading", { name: "Heading", exact: true })).toBeVisible()
  await expect(reader.locator("img, video, audio, iframe, source, style, script, svg, link, [src], [srcset]")).toHaveCount(0)
  expect(requests).toEqual([])
  await reader.getByRole("link", { name: "Web", exact: true }).click()
  await expect(root).toHaveAttribute("data-external", "https://example.com")
  await reader.getByRole("link", { name: "Mail", exact: true }).click({ button: "middle" })
  await expect(root).toHaveAttribute("data-external", "mailto:a@example.com")
  await expect(root).toHaveAttribute("data-external-count", "2")
  expect(context.pages()).toHaveLength(1)
  await reader.getByRole("link", { name: "Local", exact: true }).click()
  await expect(root.getByRole("status")).toHaveText("This link cannot be opened here. Use Original source to copy its address.")
  await root.getByRole("button", { name: "Original source", exact: true }).click()
  await expect(reader.locator(".board-discussion-source")).toHaveJSProperty("textContent", body)
  expect(requests).toEqual([])
})
