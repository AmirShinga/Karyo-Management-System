const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/categoriesController');
const { createCategorySchema, updateCategorySchema } = require('../validators/categories');

router.use(auth);

router.get('/', requirePerm('categories.view'), ctrl.listCategories);
router.post('/', requirePerm('categories.create'), validate(createCategorySchema), ctrl.createCategory);
router.put('/:id', requirePerm('categories.update'), validate(updateCategorySchema), ctrl.updateCategory);
router.delete('/:id', requirePerm('categories.delete'), ctrl.deleteCategory);

module.exports = router;
