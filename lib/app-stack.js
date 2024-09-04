const { Stack, Duration } = require('aws-cdk-lib');
const sqs = require('aws-cdk-lib/aws-sqs');
const lambda = require('aws-cdk-lib/aws-lambda');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
const cdk = require('aws-cdk-lib');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');

class AppStack extends Stack {
	/**
	 *
	 * @param {Construct} scope
	 * @param {string} id
	 * @param {StackProps=} props
	 */
	constructor(scope, id, props) {
		super(scope, id, props);

		const urlReceiverQueue = new sqs.Queue(this, 'UrlReceiverQueue', {
			queueName: 'url-receiver-queue',
			retentionPeriod: cdk.Duration.days(14),
		});

		const scraperQueue = new sqs.Queue(this, 'ScraperQueue', {
			queueName: 'scraper-queue',
			retentionPeriod: Duration.days(14),
		});

		const crawlerQueue = new sqs.Queue(this, 'CrawlerQueue', {
			queueName: 'crawler-queue',
			retentionPeriod: Duration.days(14),
		});

		const visitedUrlTable = new dynamodb.Table(this, 'VisitedUrlTable', {
			tableName: 'visited-url-table',
			partitionKey: { name: 'url', type: dynamodb.AttributeType.STRING },
		});

		const extractedDataTable = new dynamodb.Table(this, 'ExtractedDataTable', {
			tableName: 'extracted-data-table',
			partitionKey: { name: 'url', type: dynamodb.AttributeType.STRING },
			sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
		});

		const saveUrlFunction = new lambda.Function(this, 'SaveUrlFunction', {
			runtime: lambda.Runtime.NODEJS_20_X,
			handler: 'save-url.handler',
			code: lambda.Code.fromAsset('src'),
			environment: {
				CRAWLER_QUEUE_URL: crawlerQueue.tableName,
				SCRAPER_QUEUE_URL: scraperQueue.tableName,
				TABLE_VISITED_URL: visitedUrlTable.tableName,
			},
		});

		const scraperFunction = new lambda.Function(this, 'ScraperFunction', {
			runtime: lambda.Runtime.NODEJS_20_X,
			handler: 'scraper.handler',
			code: lambda.Code.fromAsset('src'),
			environment: {
				TABLE_EXTRACTED_DATA: extractedDataTable.tableName,
			},
		});

		const crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
			runtime: lambda.Runtime.NODEJS_20_X,
			handler: 'crawler.handler',
			code: lambda.Code.fromAsset('src'),
			environment: {
				QUEUE_URL: urlReceiverQueue.queueUrl,
				TABLE_VISITED_URL: visitedUrlTable.tableName,
			},
		});

		saveUrlFunction.addEventSource(new SqsEventSource(urlReceiverQueue));
		scraperFunction.addEventSource(new SqsEventSource(scraperQueue));
		crawlerFunction.addEventSource(new SqsEventSource(crawlerQueue));

		urlReceiverQueue.grantSendMessages(crawlerFunction);

		extractedDataTable.grantWriteData(scraperFunction);

		visitedUrlTable.grantReadWriteData(saveUrlFunction);
		visitedUrlTable.grantReadData(crawlerFunction);



	}
}

module.exports = { AppStack }
