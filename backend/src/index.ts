import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import campaignsRouter from './routes/campaigns';
import { requireAuth } from './middleware/auth';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', campaignsRouter);
app.use('/api', requireAuth);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`CMS Challenge backend (challenge) escuchando en puerto ${port}`);
});
