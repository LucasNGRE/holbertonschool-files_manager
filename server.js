import express from 'express';
import routes from './routes/index';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 5000;

// Crée le dossier de stockage si nécessaire
const folderPath = process.env.FOLDER_PATH?.trim() || '/tmp/files_manager';
if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

app.use(express.json());
app.use('/', routes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
