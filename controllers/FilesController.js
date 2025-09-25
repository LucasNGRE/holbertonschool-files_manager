// controllers/FilesController.js
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const ACCEPTED_TYPES = ['folder', 'file', 'image'];

const folderPath = (process.env.FOLDER_PATH && process.env.FOLDER_PATH.trim()) || '/tmp/files_manager';
if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

class FilesController {
  static async postUpload(req, res) {
    try {
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
        parentId:
    fileDocument.parentId === '0'
      ? '0'
      : fileDocument.parentId.toString(),
      });
    } catch (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  static async getShow(req, res) {
    try {
      const token = req.headers['x-token'];
      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { db } = dbClient;
      const filesCollection = db.collection('files');
      const fileId = req.params.id;

      let file;
      try {
        file = await filesCollection.findOne({
          _id: new ObjectId(fileId),
          userId: new ObjectId(userId),
        });
      } catch (err) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!file) return res.status(404).json({ error: 'Not found' });

      const resParentId = file.parentId === '0' ? '0' : file.parentId.toString();
      return res.status(200).json({
        id: file._id.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        userId: file.userId.toString(),
        parentId: resParentId,
      });
    } catch (err) {
      console.error('getShow error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  static async getIndex(req, res) {
    try {
      const token = req.headers['x-token'];
      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const parentIdQuery = req.query.parentId || '0';
      let page = parseInt(req.query.page, 10);
      if (Number.isNaN(page) || page < 0) page = 0;

      const { db } = dbClient;
      const filesCollection = db.collection('files');

      const filterParentId = parentIdQuery === '0' ? '0' : new ObjectId(parentIdQuery);

      const files = await filesCollection
        .find({ userId: new ObjectId(userId), parentId: filterParentId })
        .skip(page * 20)
        .limit(20)
        .toArray();

      const result = files.map((file) => ({
        id: file._id.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        userId: file.userId.toString(),
        parentId: file.parentId === '0' ? '0' : file.parentId.toString(),
      }));

      return res.status(200).json(result);
    } catch (err) {
      console.error('getIndex error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fileId = req.params.id;
    let file;
    try {
      file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!file) return res.status(404).json({ error: 'Not found' });
    await dbClient.db.collection('files').updateOne({ _id: file._id }, { $set: { isPublic: true } });
    file.isPublic = true;
    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: file.parentId && file.parentId.toString ? file.parentId.toString() : file.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fileId = req.params.id;
    let file;
    try {
      file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!file) return res.status(404).json({ error: 'Not found' });
    await dbClient.db.collection('files').updateOne({ _id: file._id }, { $set: { isPublic: false } });
    file.isPublic = false;
    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: file.parentId && file.parentId.toString ? file.parentId.toString() : file.parentId,
    });
  }

  static async getFile(req, res) {
    try {
      const fileId = req.params.id;
      let file;
      try {
        file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });
      } catch (err) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!file) return res.status(404).json({ error: 'Not found' });

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      if (!file.isPublic) {
        const token = req.headers['x-token'];
        if (!token) return res.status(404).json({ error: 'Not found' });
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId || userId !== file.userId.toString()) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (!file.localPath || !fs.existsSync(file.localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      return fs.createReadStream(file.localPath).pipe(res);
    } catch (err) {
      console.error('getFile error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
}

export default FilesController;
