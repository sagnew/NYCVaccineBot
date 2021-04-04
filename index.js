const client = require('twilio')();
const puppeteer = require('puppeteer');

const vaccineUrl = 'https://am-i-eligible.covid19vaccine.health.ny.gov/';

// Pretty sure this info isn't that sensitive.
const MAP_SID = 'MPd619fc22e4c14146b3656723855a7e4c';

// Gets a Twilio Sync Map object for all users who are subscribed for updates.
const gatherSubscribers = async function() {
  const subscribers = await client.sync.services(process.env.TWILIO_SERVICE_SID)
    .syncMaps('MPd619fc22e4c14146b3656723855a7e4c')
    .syncMapItems
    .list({ subscribed: 'yes' })
  return subscribers;
};

// Takes an array of subscribers and sends a text message notification to all of them.
const notifySubscribers = async function(subscribers) {
  const tasks = subscribers.map(subscriber => {
    const number = subscriber.key;
    return client.messages.create({ to: number, from: process.env.TWILIO_NUMBER, body: 'Test'});
  });
  const results = await Promise.all(tasks);
  return results;
};

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(vaccineUrl);
  await page.waitForTimeout(2000);

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

  const latestUpdated = await page.$$eval('span', elements => elements.filter(element => {
    return element.textContent.includes('Last updated');
  }).map(element => element.textContent)[0].trim());

  vaccinationCenters.forEach(location => console.log(location));
  console.log(latestUpdated);

  await browser.close();

  // Send out the notifications
  const subscribers = await gatherSubscribers();
  console.log(await notifySubscribers(subscribers));
})();
