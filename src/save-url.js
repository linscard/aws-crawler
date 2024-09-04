const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const sqs = require('@aws-sdk/client-sqs');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
	try {
		console.log('Received event:', JSON.stringify(event, null, 2));

		for (const record of event.Records) {
			const body = JSON.parse(record.body);
			const url = cleanUrl(body.url);

			const urlIsVisited = await checkUrlIsVisited(url);
			if (urlIsVisited) {
				console.log(`URL already visited: ${url}`);
				continue;
			}

			const robotsTxt = await fetchRobotsTxt(url);
			console.log(`Received robots.txt: ${robotsTxt}`);

			const delay = robotsTxt.includes('Crawl-delay:') ? robotsTxt.match(/Crawl-delay: (\d+)/)[1] : 1000;
			console.log(`Crawl delay: ${delay}`);

			if (robotsTxt.includes('Disallow: /')) {
				console.log(`Disallowing URL: ${url}`);
				continue;
			}

			const params = {
				TableName: process.env.TABLE_VISITED_URL,
				Item: {
					url: { S: url },
					createdAt: { N: Date.now().toString() },
					robotsTxt: { S: robotsTxt },
				},
			};

			await client.send(new PutCommand(params));
			await sendMessageToQueue(process.env.CRAWLER_QUEUE_URL, { url, delay });
			await sendMessageToQueue(process.env.SCRAPER_QUEUE_URL, { url });


			console.log(`Saved URL: ${url} whit robots.txt: ${robotsTxt}`);

		}
	} catch (error) {
		console.error('Error:', error);
		throw error;
	}

}

async function checkUrlIsVisited(url) {
	console.log(`Checking if URL is visited: ${url}`);
	console.log(`Table name: ${process.env.TABLE_VISITED_URL}`);
	const params = {
		TableName: process.env.TABLE_VISITED_URL,
		Key: {
			url: url.toString(),
		},
	};

	const { Item } = await client.send(new GetCommand(params));
	console.log(`URL is visited: ${!!Item}`);
	return !!Item;
}

async function sendMessageToQueue(queue, message) {
	const params = {
		MessageBody: JSON.stringify(message),
		QueueUrl: queue,
	};

	await sqs.sendMessage(params).promise();
}

async function fetchRobotsTxt(url) {
	const response = await fetch(url + 'robots.txt');
	if (!response.ok) {
		return '';
	}
	return response.text();
}

function cleanUrl(url) {
	url = url.trim();

	if (!/^https?:\/\//i.test(url)) {
		url = 'https://' + url;
	}

	url = url.replace(/([^:])\/{2,}/g, '$1/');

	if (!/\.[a-z]{2,4}(\?.*)?$/i.test(url) && !url.endsWith('/')) {
		url += '/';
	}

	const hostname = new URL(url).hostname;
	if (!hostname.startsWith('www.') && hostname.indexOf('.') === hostname.lastIndexOf('.')) {
		url = url.replace(/(https?:\/\/)/i, '$1www.');
	}
	return url;
}
