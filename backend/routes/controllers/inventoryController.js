const { pool, withTransaction } = require('../../config/db');
const { sendData, notFound, badRequest, paginate, pageMeta } = require('../../utils/response');

function mapItem(r) {
  const quantity = Number(r.quantity);
  const reorderLevel = Number(r.reorder_level);
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    quantity,
    reorderLevel,
    unitCost: Number(r.unit_cost),
    value: Number((quantity * Number(r.unit_cost)).toFixed(2)),
    lowStock: quantity <= reorderLevel,
    active: !!r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapTransaction(r) {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name || null,
    type: r.type,
    quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost),
    reason: r.reason,
    reference: r.reference,
    recordedBy: r.recorded_by,
    recorderName: r.recorder_name || null,
    createdAt: r.created_at,
  };
}

async function listItems(req, res, next) {
  try {
    const { active, lowStock } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (active === 'true' || active === 'false') {
      where.push('active = ?');
      params.push(active === 'true' ? 1 : 0);
    }
    if (lowStock === 'true') {
      where.push('quantity <= reorder_level');
    }
    if (search) {
      where.push('name LIKE ?');
      params.push(`%${search}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_items WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM inventory_items WHERE ${where.join(' AND ')} ORDER BY name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapItem), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    const b = req.body;
    const [result] = await pool.query(
      `INSERT INTO inventory_items (name, unit, quantity, reorder_level, unit_cost, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [b.name, b.unit, b.quantity, b.reorderLevel, b.unitCost, b.active === false ? 0 : 1]
    );
    const [rows] = await pool.query('SELECT * FROM inventory_items WHERE id = ?', [result.insertId]);
    return sendData(res, mapItem(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const map = { name: 'name', unit: 'unit', reorderLevel: 'reorder_level', unitCost: 'unit_cost', active: 'active' };
    const sets = [];
    const values = [];
    for (const [key, col] of Object.entries(map)) {
      if (b[key] !== undefined) {
        sets.push(`${col} = ?`);
        values.push(key === 'active' ? (b[key] ? 1 : 0) : b[key]);
      }
    }
    if (!sets.length) return next(badRequest('No fields to update'));
    values.push(id);
    const [result] = await pool.query(
      `UPDATE inventory_items SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
    if (!result.affectedRows) return next(notFound('Inventory item not found'));
    const [rows] = await pool.query('SELECT * FROM inventory_items WHERE id = ?', [id]);
    return sendData(res, mapItem(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE inventory_items SET deleted_at = NOW(), active = 0 WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!result.affectedRows) return next(notFound('Inventory item not found'));
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

async function listTransactions(req, res, next) {
  try {
    const { itemId, type, from, to } = req.query;
    const { page, limit, offset } = paginate(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (itemId) {
      where.push('x.item_id = ?');
      params.push(itemId);
    }
    if (type) {
      where.push('x.type = ?');
      params.push(type);
    }
    if (from) {
      where.push('x.created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push('x.created_at <= ?');
      params.push(`${to} 23:59:59`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_transactions x WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT x.*, i.name AS item_name, u.name AS recorder_name
       FROM inventory_transactions x
       LEFT JOIN inventory_items i ON i.id = x.item_id
       LEFT JOIN users u ON u.id = x.recorded_by
       WHERE ${where.join(' AND ')} ORDER BY x.created_at DESC, x.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapTransaction), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

function deltaFor(type, quantity) {
  if (type === 'purchase' || type === 'return') return quantity;
  if (type === 'usage' || type === 'wastage') return -Math.abs(quantity);
  return quantity; // adjustment: signed delta
}

async function createTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const delta = deltaFor(b.type, b.quantity);

    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM inventory_items WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (!rows.length) throw notFound('Inventory item not found');
      const item = rows[0];
      const nextQty = Number(item.quantity) + delta;
      if (nextQty < 0) {
        throw badRequest('Transaction would result in negative stock');
      }

      await conn.query(
        `INSERT INTO inventory_transactions (item_id, type, quantity, unit_cost, reason, reference, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          b.type,
          b.quantity,
          b.unitCost === undefined ? item.unit_cost : b.unitCost,
          b.reason || null,
          b.reference || null,
          req.user.id,
        ]
      );
      await conn.query('UPDATE inventory_items SET quantity = ? WHERE id = ?', [nextQty, id]);
      const [itemRows] = await conn.query('SELECT * FROM inventory_items WHERE id = ?', [id]);
      return itemRows[0];
    });

    return sendData(res, mapItem(updated), undefined, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listItems,
  createItem,
  updateItem,
  deleteItem,
  listTransactions,
  createTransaction,
};
