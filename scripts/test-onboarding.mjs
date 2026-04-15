import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false, slowMo: 300 });
const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
const page = await context.newPage();

// Generate unique values
const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const email = `sean+test_${uid}@foyersavings.com`;
const password = `Pw!${uid}2025`;

console.log(`Email: ${email}`);
console.log(`Password: ${password}`);

async function title() {
  // Grab all visible headings and pick the most specific one
  const headings = page.locator('h1, h2, h3');
  const count = await headings.count();
  for (let i = 0; i < count; i++) {
    const text = (await headings.nth(i).textContent())?.trim();
    // Skip generic site name
    if (text && !text.match(/^Foyer\s*(App|Savings)?$/i) && text.length > 3) {
      return text.split('\n')[0].trim();
    }
  }
  // Fall back to URL path
  const path = new URL(page.url()).pathname.split('/').pop() || 'home';
  return path.replace(/-/g, ' ');
}

try {
  // Step 1: Navigate to home
  await page.goto('https://app-dev.foyersavings.com/');
  await page.waitForLoadState('networkidle');
  console.log(`✓ Step 1: "${await title()}" — ${page.url()}`);

  // Step 2: Click Get Started
  await page.getByRole('link', { name: 'Get started' }).click();
  await page.waitForTimeout(3000);
  console.log(`✓ Step 2: "${await title()}" — ${page.url()}`);

  // Step 3: Fill location & home details
  const cityInput = page.getByPlaceholder('Enter City or Zip');
  await cityInput.click();
  await cityInput.fill('04101');
  await page.getByTestId('prediction-item').first().click();
  await page.locator('div').filter({ hasText: /^In 1-2 years$/ }).click();
  const priceInput = page.getByRole('textbox', { name: 'Home Price' });
  await priceInput.click();
  await priceInput.fill('425000');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);
  console.log(`✓ Step 3: "${await title()}" — ${page.url()}`);

  // Step 4: Select preferences
  await page.locator('label').nth(1).click();
  const motivationOption = page.getByText(/Having a place that/);
  if (await motivationOption.count() > 0) {
    await motivationOption.first().click();
  }
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);
  console.log(`✓ Step 4: "${await title()}" — ${page.url()}`);

  // Step 5
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);
  console.log(`✓ Step 5: "${await title()}" — ${page.url()}`);

  // Step 6
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);
  console.log(`✓ Step 6: "${await title()}" — ${page.url()}`);

  // Step 7: Create account
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('textbox', { name: 'Phone Number' }).fill('(207) 527-0916');

  // The checkbox input is aria-hidden (styled-components custom checkbox).
  // Directly set it checked via JS to avoid viewport/visibility issues.
  await page.locator('input[name="terms"]').evaluate((el) => {
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForTimeout(3000);
  console.log(`✓ Step 7: "${await title()}" — ${page.url()}`);

  console.log('\n✅ All steps passed!');
  console.log(`Credentials: ${email} / ${password}`);
} catch (err) {
  console.error('\n❌ Failed:', err.message);
  await page.screenshot({ path: '/tmp/onboarding-failure.png', fullPage: true });
  console.log('Screenshot saved to /tmp/onboarding-failure.png');
} finally {
  await page.waitForTimeout(2000);
  await browser.close();
}
