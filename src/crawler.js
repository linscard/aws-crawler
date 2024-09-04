const axios = require('axios');
const cheerio = require('cheerio');
const sqs = require('@aws-sdk/client-sqs');

exports.handler = async (event) => {
	try {
		console.log('Received event:', JSON.stringify(event, null, 2));

		for (const record of event.Records) {
			const body = JSON.parse(record.body)
			const { url, delay } = body;
			await new Promise((resolve) => setTimeout(resolve, delay));

			const response = await axios.get(url);
			const $ = cheerio.load(response.data);
			const links = [];

			$('a').each((i, el) => {
				links.push($(el).attr('href'));
			});

			console.log(`Found ${links.length} links on ${url}`);
		}

		const promises = [];
		for (const link of links) {
			promises.push(sendMessageToQueue(process.env.SCRAPER_QUEUE_URL, { url: link }));
			console.log(`Sent link to scraper queue: ${link}`);
		}

		await Promise.all(promises);
		console.log('Sent all links to scraper queue');

	}
	catch (error) {
		console.error('Error:', error);
		throw error;
	}
}

async function sendMessageToQueue(queue, message) {
	const params = {
		MessageBody: JSON.stringify(message),
		QueueUrl: queue,
	};

	await sqs.sendMessage(params).promise();
}