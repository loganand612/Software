// Quick script to check and potentially fix MongoDB authentication
// Run this: node fix-mongodb-auth.js

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';

async function testConnection() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    // Try to create a test document
    const db = client.db('ai-meeting-buddy');
    const collection = db.collection('test');
    
    await collection.insertOne({ test: 'connection test', timestamp: new Date() });
    console.log('✅ Write test successful - No authentication required!');
    
    // Clean up
    await collection.deleteOne({ test: 'connection test' });
    
  } catch (error) {
    if (error.message.includes('not authorized') || error.message.includes('authentication')) {
      console.error('❌ MongoDB requires authentication');
      console.error('\n💡 Solutions:');
      console.error('1. Disable authentication in MongoDB config');
      console.error('2. Create a user: mongosh -> use admin -> db.createUser({user:"user", pwd:"pass", roles:[{role:"readWriteAnyDatabase", db:"admin"}]})');
      console.error('3. Update connection string: mongodb://user:pass@localhost:27017/ai-meeting-buddy?authSource=admin');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await client.close();
  }
}

testConnection();

