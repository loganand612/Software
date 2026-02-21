// Script to create a MongoDB user for AI Meeting Buddy
// Run this: node create-mongo-user.js

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const username = 'meetinguser';
const password = 'meeting123';

async function createUser() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const adminDb = client.db('admin');
    
    // Try to create user
    try {
      await adminDb.command({
        createUser: username,
        pwd: password,
        roles: [
          { role: 'readWriteAnyDatabase', db: 'admin' }
        ]
      });
      console.log('✅ User created successfully!');
      console.log(`\n📝 Update server.js with this connection string:`);
      console.log(`mongodb://${username}:${password}@localhost:27017/ai-meeting-buddy?authSource=admin`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  User already exists, that\'s okay!');
        console.log(`\n📝 Use this connection string in server.js:`);
        console.log(`mongodb://${username}:${password}@localhost:27017/ai-meeting-buddy?authSource=admin`);
      } else {
        console.error('❌ Error creating user:', error.message);
        console.error('\n💡 You may need to run this manually in mongosh:');
        console.error(`use admin`);
        console.error(`db.createUser({user:"${username}", pwd:"${password}", roles:[{role:"readWriteAnyDatabase", db:"admin"}]})`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

createUser();

