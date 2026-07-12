// Consumer for Debezium CDC events from Kafka
const { Kafka, logLevel } = require('kafkajs'); // Import kafkajs library for Kafka consumer
const BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(','); // Get Kafka brokers from environment variable or use default
const TOPIC_PREFIX = process.env.TOPIC_PREFIX || 'dbserver1'; // Get topic prefix from environment variable or use default
const DB_NAME = process.env.DB_NAME || 'app_db'; // Get database name from environment variable or use default
const GROUP_ID = process.env.KAFKA_GROUP_ID || 'cdc-consumer-group'; // Get Kafka consumer group ID from environment variable or use default
const TABLES = ['users', 'user_tokens']; // List of tables to consume events from

const kafka = new Kafka({
    clientId: 'cdc-consumer',
    brokers: BROKERS,
    logLevel: logLevel.NOTHING, // Set log level to nothing to suppress logs
    retry: { retries: 20, initialRetryTime: 1000 } // Retry configuration
});

const consumer = kafka.consumer({ groupId: GROUP_ID }); // Create a Kafka consumer with the specified group ID

function describeOp(op) {
    switch (op) {
        case 'c': return 'CREATE';
        case 'r': return 'READ (snapshot)';
        case 'u': return 'UPDATE';
        case 'd': return 'DELETE';
        default:
            console.warn(`Received unknown operation type from Debezium: ${op}`);
            return 'UNKNOWN';
    }
}

const topics = TABLES.map((table) => `${TOPIC_PREFIX}.${DB_NAME}.${table}`); // Generate topic names based on the specified tables

// Run the consumer 
async function run() {
  await consumer.connect();
  await consumer.subscribe({ topics, fromBeginning: true });

  console.log(`CDC consumer connected. Watching topics: ${topics.join(', ')}`);

// Process each incoming message , and log a summary of the event 
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return; // tombstone message

      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (err) {
        console.error('Failed to parse CDC message:', err.message);
        return;
      }

      const payload = event.payload || event; // handles both envelope styles
      // Log a summary of the event in a structured format
      const summary = {
        topic,
        partition,
        offset: message.offset,
        operation: describeOp(payload.op),
        table: payload.source ? `${payload.source.db}.${payload.source.table}` : undefined,
        before: payload.before,
        after: payload.after,
        tsMs: payload.ts_ms,
      };

      console.log(JSON.stringify(summary, null, 2));
    },
  });
}

// Start the consumer and handle any errors
run().catch((err) => {
  console.error('CDC consumer crashed:', err);
  process.exit(1);
});

// Gracefully handle termination signals to disconnect the consumer
process.on('SIGTERM', async () => {
  await consumer.disconnect();
  process.exit(0);
});