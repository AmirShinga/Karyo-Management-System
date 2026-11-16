const { pool } = require('../../config/db');
const { sendData, notFound, conflict, badRequest, paginate, pageMeta } = require('../../utils/response');

function mapItem(m) {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price: Number(m.price),
    cost: Number(m.cost),
    available: !!m.available,
    sortOrder: Number(m.sort_order) || 0,
    imageUrl: m.image_url,
    createdAt: m.created_at,
  };
}

function emit(req, event, payload) {
  const io = req.app.get('io');
  if (io) io.emit(event, payload);
}

async function listMenu(req, res, next) {
  try {
    const { category, available } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (available === 'true' || available === 'false') {
      where.push('available = ?');
      params.push(available === 'true' ? 1 : 0);
    }
    if (search) {
      where.push('(name LIKE ? OR category LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM menu_items WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM menu_items WHERE ${where.join(' AND ')} ORDER BY sort_order ASC, category ASC, name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapItem), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createMenuItem(req, res, next) {
  try {
    const b = req.body;
    const [result] = await pool.query(
      `INSERT INTO menu_items (name, category, price, cost, available, sort_order, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        b.name,
        b.category,
        b.price,
        b.cost || 0,
        b.available === false ? 0 : 1,
        b.sortOrder || 0,
        b.imageUrl || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    emit(req, 'menu:updated', { id: result.insertId });
    return sendData(res, mapItem(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateMenuItem(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const map = {
      name: 'name',
      category: 'category',
      price: 'price',
      cost: 'cost',
      available: 'available',
      sortOrder: 'sort_order',
      imageUrl: 'image_url',
    };
    const sets = [];
    const values = [];
    for (const [key, col] of Object.entries(map)) {
      if (b[key] !== undefined) {
        sets.push(`${col} = ?`);
        values.push(key === 'available' ? (b[key] ? 1 : 0) : b[key]);
      }
    }
    if (!sets.length) return next(badRequest('No fields to update'));

    values.push(id);
    const [result] = await pool.query(
      `UPDATE menu_items SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
    if (!result.affectedRows) return next(notFound('Menu item not found'));

    const [rows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    emit(req, 'menu:updated', { id: Number(id) });
    return sendData(res, mapItem(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function setAvailability(req, res, next) {
  try {
    const { id } = req.params;
    const { available } = req.body;
    const [result] = await pool.query(
      'UPDATE menu_items SET available = ? WHERE id = ? AND deleted_at IS NULL',
      [available ? 1 : 0, id]
    );
    if (!result.affectedRows) return next(notFound('Menu item not found'));
    emit(req, 'menu:updated', { id: Number(id) });
    return sendData(res, { id: Number(id), available });
  } catch (err) {
    next(err);
  }
}

async function deleteMenuItem(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE menu_items SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!result.affectedRows) return next(notFound('Menu item not found'));
    emit(req, 'menu:updated', { id: Number(id) });
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMenu, createMenuItem, updateMenuItem, setAvailability, deleteMenuItem };
