import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadsPath = req.app.get('uploadsPath');
    cb(null, uploadsPath);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Apenas imagens são permitidas'));
  },
});

router.post('/', requireAuth(), upload.array('file', 5), (req, res) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ message: 'Nenhum arquivo enviado' });
  }

  const files = req.files.map((file: any) => {
    // Retornar URL relativa para funcionar com proxy do Vite
    const relativeUrl = `/uploads/${file.filename}`;
    return {
      url: relativeUrl,
      filename: file.filename,
    };
  });

  res.json({ files, message: 'Arquivos enviados com sucesso' });
});

