const client = require('twilio')();
const puppeteer = require('puppeteer');

const vaccineUrl = 'https://am-i-eligible.covid19vaccine.health.ny.gov/';

// Pretty sure this info isn't that sensitive.
const MAP_SID = 'MPd619fc22e4c14146b3656723855a7e4c';

// Gets the log for the last time the page was updated.
const getLastUpdated = async function() {
  const document = await client.sync.services(process.env.TWILIO_SERVICE_SID)
    .documents('updateLog')
    .fetch();
  return document.data.lastUpdated;
};

// Updates the log if the page has changed since last time.
const updateLastUpdated = async function(latestUpdated) {
  const document = await client.sync.services(process.env.TWILIO_SERVICE_SID)
    .documents('updateLog')
    .update({data: { lastUpdated: latestUpdated }});
  console.log('Updated log:');
  console.log(document.data);
};

// Gets a Twilio Sync Map object for all users who are subscribed for updates.
const gatherSubscribers = async function() {
  const subscribers = await client.sync.services(process.env.TWILIO_SERVICE_SID)
    .syncMaps('MPd619fc22e4c14146b3656723855a7e4c')
    .syncMapItems
    .list({ subscribed: 'yes' })
  return subscribers;
};

// Takes an array of subscribers and sends a text message notification to all of them.
const notifySubscribers = async function(subscribers, messageBody) {
  const tasks = subscribers.map(subscriber => {
    const number = subscriber.key;
    return client.messages.create({ to: number, from: process.env.TWILIO_NUMBER, body: messageBody });
  });
  const results = await Promise.allSettled(tasks);
  return results.map(result => {
    return { status: result.status, sid: result.value.sid };
  });
};

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Go to the page with the vaccine appointments.
  await page.goto(vaccineUrl);
  await page.waitForTimeout(2000);

  // Gather info for all of the locations of interest that have available appointments.
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

  // Find out when the page was most recently update.
  const latestUpdated = await page.$$eval('span', elements => elements.filter(element => {
    return element.textContent.includes('Last updated');
  }).map(element => element.textContent)[0].trim());

  // We should now be done with headless browsing, so close Puppeteer.
  await browser.close();

  // Find out when the last update was.
  const lastUpdated = await getLastUpdated();

  // If the page has changed, send out the notifications and update the log.
  if (lastUpdated !== latestUpdated) {
    const initialString = `The following vaccination centers in NYC now have appointments available:\n\n`;
    let messageBody = vaccinationCenters.reduce( (accumulator, location) => {
      if (location.available === 'Yes') {
        return accumulator + `${location.name} for the ${location.type} vaccine\n`;
      }
      return accumulator;
    }, initialString);

    // Make sure at least one of the sites actually has appointments.
    if (messageBody !== initialString) {
      // Add the finishing touches to the message.
      messageBody += `\n${latestUpdated}\n\nVisit this page to make an appointment:\n\n${vaccineUrl}`;

      // Finally send out the notifications
      const subscribers = await gatherSubscribers();
      console.log(await notifySubscribers(subscribers, messageBody));

      // Update the log.
      await updateLastUpdated(latestUpdated);
    }
  }
})();
