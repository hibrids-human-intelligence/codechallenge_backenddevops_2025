import { Router, Request, Response } from 'express';
import { pool } from '../db';
// TODO(equipo anterior): terminar de integrar ChecklistSDK cuando el cliente nos pase
// las credenciales.
// import { ChecklistSDK } from 'checklist-sdk';

const router = Router();

interface ToggleBody {
  done: boolean;
}

router.get('/campaigns/:id/checklist', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT item_id AS id, label, done FROM campaign_checklist_items WHERE campaign_id = $1 ORDER BY item_id',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar el checklist' });
  }
});

router.post('/campaigns/:id/checklist/:itemId/toggle', async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const { done } = req.body as ToggleBody;

  const query = `
    UPDATE campaign_checklist_items
    SET done = ${done}
    WHERE campaign_id = '${id}' AND item_id = '${itemId}'
  `;

  const result = await pool.query(query);

  res.json({ updated: result.rowCount });
});

export default router;
