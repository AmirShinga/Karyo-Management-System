const { pool } = require('../../config/db');
const { sendData, notFound, conflict, badRequest, paginate, pageMeta } = require('../../utils/response');

function mapCategory(c) {
  return {
    id: c.id,
    name: c.name,
    sortOrder: Number(c.sort_order) || 0,
    createdAt: c.created_at,
  };
}

async function listCategories(req, res, next) {
  try {
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (search) {
      where.push('name LIKE ?');
      params.push(`%${search}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM menu_categories WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM menu_categories WHERE ${where.join(' AND ')} ORDER BY sort_order ASC, name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapCategory), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const b = req.body;
    const [existing] = await pool.query(
      'SELECT id FROM menu_categories WHERE name = ? AND deleted_at IS NULL',
      [b.name]
    );
    if (existing.length) return next(conflict('A category with that name already exists'));

    const [result] = await pool.query(
      'INSERT INTO menu_categories (name, sort_order) VALUES (?, ?)',
      [b.name, b.sortOrder || 0]
    );
    const [rows] = await pool.query('SELECT * FROM menu_categories WHERE id = ?', [result.insertId]);
    return sendData(res, mapCategory(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const [rows] = await pool.query(
      'SELECT * FROM menu_categories WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!rows.length) return next(notFound('Category not found'));
    const current = rows[0];

    const sets = [];
    const values = [];
    if (b.name !== undefined && b.name !== current.name) {
      const [dupe] = await pool.query(
        'SELECT id FROM menu_categories WHERE name = ? AND deleted_at IS NULL AND id <> ?',
        [b.name, id]
      );
      if (dupe.length) return next(conflict('A category with that name already exists'));
      sets.push('name = ?');
      values.push(b.name);
    }
    if (b.sortOrder !== undefined) {
      sets.push('sort_order = ?');
      values.push(b.sortOrder);
    }
    if (!sets.length) return next(badRequest('No fields to update'));

    values.push(id);
    await pool.query(
      `UPDATE menu_categories SET ${sets.join(', ')} WHERE id = ?`,
      values
    );

    if (b.name !== undefined && b.name !== current.name) {
      await pool.query(
        'UPDATE menu_items SET category = ? WHERE category = ? AND deleted_at IS NULL',
        [b.name, current.name]
      );
    }

    const [fresh] = await pool.query('SELECT * FROM menu_categories WHERE id = ?', [id]);
    return sendData(res, mapCategory(fresh[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM menu_categories WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!rows.length) return next(notFound('Category not found'));

    const [[{ inUse }]] = await pool.query(
      'SELECT COUNT(*) AS inUse FROM menu_items WHERE category = ? AND deleted_at IS NULL',
      [rows[0].name]
    );
    if (inUse > 0) {
      return next(conflict('Category is used by existing dishes; reassign them first'));
    }

    await pool.query('UPDATE menu_categories SET deleted_at = NOW() WHERE id = ?', [id]);
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
