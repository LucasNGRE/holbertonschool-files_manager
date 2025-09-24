import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Basic ')
      ? authHeader.slice(6)
      : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const [email, password] = Buffer.from(token, 'base64')
      .toString()
      .split(':');

    const user = await dbClient.db.collection('users').findOne({
      email,
      password: sha1(password),
    });

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const sessionToken = `auth_${new ObjectId().toString()}`;
    await redisClient.set(`auth_${sessionToken}`, user._id.toString(), 24 * 3600);
    return res.status(200).json({ token: sessionToken });
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

    return res.status(200).json({ id: user._id, email: user.email });
  }
}

export default AuthController;
