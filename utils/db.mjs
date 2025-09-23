// utils/db.mjs
import mongodb from 'mongodb';
const { MongoClient } = mongodb;

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}`;

class DBClient {
  constructor() {
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.client.connect()
      .then(() => { this.db = this.client.db(database); })
      .catch(() => { this.db = null; });
  }

  isAlive() {
    return !!(this.client && this.client.topology && this.client.topology.isConnected());
  }

  async nbUsers() {
    return this.db ? this.db.collection('users').countDocuments() : 0;
  }

  async nbFiles() {
    return this.db ? this.db.collection('files').countDocuments() : 0;
  }
}

const dbClient = new DBClient();
export default dbClient;
