const puppeteer = require('puppeteer');

const vaccineUrl = 'https://am-i-eligible.covid19vaccine.health.ny.gov/';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(vaccineUrl);
  await page.waitForTimeout(1000);

  const vaccinationCenters = await page.$$eval('td', elements => elements.filter(element => {
    const locations = ['Javits Center', 'Bronx - Bay Eden Senior Center'];
    return locations.includes(element.textContent);
  }).map(element => {
    return {
      name: element.textContent,
      type: element.nextElementSibling.textContent,
      available: element.nextElementSibling.nextElementSibling.nextElementSibling.textContent
    }
  }));

  const lastUpdated = await page.$$eval('span', elements => elements.filter(element => {
    return element.textContent.includes('Last updated');
  }).map(element => element.textContent)[0].trim());

  vaccinationCenters.forEach(location => console.log(location));
  console.log(lastUpdated);

  await browser.close();
})();
