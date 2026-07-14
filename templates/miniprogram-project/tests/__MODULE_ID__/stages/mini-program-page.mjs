export async function waitForElement(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const element = await page.$(selector);
    if (element) {
      return element;
    }
    await page.waitFor(200);
  }
  throw new Error(`Mini Program selector not found within ${timeoutMs}ms: ${selector}`);
}

export async function waitForPagePath(miniProgram, expectedPath, timeoutMs) {
  const normalizedExpectedPath = normalizePagePath(expectedPath);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = await miniProgram.currentPage();
    if (page && normalizePagePath(page.path) === normalizedExpectedPath) {
      return page;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Mini Program route did not become "${normalizedExpectedPath}" within ${timeoutMs}ms.`);
}

export function normalizePagePath(pagePath) {
  return String(pagePath || '').replace(/^\//, '');
}

export async function assertElementText(element, expectedText, selector) {
  const actualText = await element.text();
  if (expectedText !== undefined && actualText.trim() !== expectedText.trim()) {
    throw new Error(
      `Mini Program element ${selector} text mismatch. Expected "${expectedText}", received "${actualText}".`
    );
  }
  return actualText;
}
