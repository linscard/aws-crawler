const puppeteer = require('puppeteer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
	try {
		console.log('Received event:', JSON.stringify(event, null, 2));

		for (const record of event.Records) {
			const body = JSON.parse(record.body);
			const { url } = body;

			const browser = await puppeteer.launch({
				headless: true,
				args: ['--no-sandbox', '--disable-setuid-sandbox']
			});
			const page = await browser.newPage();
			await page.goto(url);

			const cookies = [];
			cookies.push(await page.cookies());

			await page.reload({ waitUntil: 'networkidle2' });
			cookies.push(await page.cookies());

			await browser.close();

			const params = {
				TableName: process.env.TABLE_EXTRACTED_DATA,
				Item: {
					url: { S: url },
					createdAt: { N: Date.now().toString() },
					cookies: { S: JSON.stringify(cookies) },
				},
			};

			await client.send(new PutCommand(params));
			console.log(`Saved cookies for URL: ${url}`);
		}
	} catch (error) {
		console.error('Error:', error);
		throw error;
	}
}