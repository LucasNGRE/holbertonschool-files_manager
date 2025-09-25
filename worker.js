import Bull from 'bull';
import imageThumbnail from 'image-thumbnail';
import { promises as fs } from 'fs';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;
  if (!fileId) return done(new Error('Missing fileId'));
  if (!userId) return done(new Error('Missing userId'));

  const file = await dbClient.db
    .collection('files')
    .findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

  if (!file) return done(new Error('File not found'));
  if (file.type !== 'image') return done(null, 'Not an image');

  try {
    const sizes = [500, 250, 100];
    await Promise.all(
      sizes.map(async (size) => {
        const thumb = await imageThumbnail(file.localPath, { width: size });
        await fs.writeFile(`${file.localPath}_${size}`, thumb);
      }),
    );
    return done();
  } catch (err) {
    return done(err);
  }
});
