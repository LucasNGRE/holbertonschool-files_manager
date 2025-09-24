import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const base64Creds = authHeader.split(' ')[1];
    const [email, password] = Buffer.from(base64Creds, 'base64')
      .toString()
      .split(':');

    if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

    const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

    const user = await dbClient.db.collection('users').findOne({
      email,
      password: hashedPassword,
    });

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const token = uuidv4();
    await redisClient.set(`auth_${token}`, user._id.toString(), 24 * 60 * 60);

    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await redisClient.del(key);
    return res.status(204).send();
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    return res.status(200).json({ id: user._id.toString(), email: user.email });
  }
}

export default AuthController;
