// controllers/FilesController.js
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const ACCEPTED_TYPES = ['folder', 'file', 'image'];

// Crée le dossier de stockage au démarrage
const folderPath = (process.env.FOLDER_PATH && process.env.FOLDER_PATH.trim()) || '/tmp/files_manager';

if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

class FilesController {
  static async postUpload(req, res) {
    try {
      // Vérification du token
      const token = req.headers['x-token'];
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const {
        name, type, parentId = '0', isPublic = false, data,
      } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!type || !ACCEPTED_TYPES.includes(type)) return res.status(400).json({ error: 'Missing type' });
      if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

      const { db } = dbClient;
      const filesCollection = db.collection('files');

      // Vérification du parent si différent de '0'
      let parentObj = null;
      if (parentId !== '0') {
        try {
          parentObj = await filesCollection.findOne({ _id: new ObjectId(parentId) });
        } catch (err) {
          return res.status(400).json({ error: 'Parent not found' });
        }
        if (!parentObj) return res.status(400).json({ error: 'Parent not found' });
        if (parentObj.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
      }

      const fileDocument = {
        userId: new ObjectId(userId),
        name,
        type,
        isPublic,
        parentId: parentId === '0' ? '0' : new ObjectId(parentId),
      };

      // Si c'est un fichier ou une image, on écrit le fichier sur le disque
      if (type !== 'folder') {
        const localFilename = uuidv4();
        const localPath = path.join(folderPath, localFilename);
        fs.writeFileSync(localPath, Buffer.from(data, 'base64'));
        fileDocument.localPath = localPath;
      }

      const result = await filesCollection.insertOne(fileDocument);

      return res.status(201).json({
        id: result.insertedId,
        name: fileDocument.name,
        type: fileDocument.type,
        isPublic: fileDocument.isPublic,
        userId: fileDocument.userId.toString(),
        parentId: fileDocument.parentId === '0' ? '0' : fileDocument.parentId.toString(),
      });
    } catch (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
}

export default FilesController;
