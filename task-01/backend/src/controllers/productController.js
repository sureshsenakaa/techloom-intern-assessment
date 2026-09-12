const inventoryService = require('../services/inventoryService');

exports.getProducts = async (req, res, next) => {
  try {
    const products = await inventoryService.getAllProducts();
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
};

exports.getProductById = async (req, res, next) => {
  try {
    const product = await inventoryService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

exports.getProductStock = async (req, res, next) => {
  try {
    const stock = await inventoryService.getProductStock(req.params.id);
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    res.json({
      success: true,
      data: {
        id: stock.id,
        name: stock.name,
        sku: stock.sku,
        availableStock: stock.available_stock,
        reservedStock: stock.reserved_stock
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const { name, sku, description, price, available_stock } = req.body;
    if (!name || !sku || price === undefined) {
      return res.status(400).json({ success: false, message: 'Name, SKU, and price are required.' });
    }
    const product = await inventoryService.createProduct({
      name,
      sku,
      description,
      price,
      available_stock: available_stock !== undefined ? available_stock : 0
    });
    res.status(201).json({ success: true, message: 'Product created successfully.', data: product });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A product with this SKU already exists.' });
    }
    next(err);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await inventoryService.updateProduct(req.params.id, req.body);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    res.json({ success: true, message: 'Product updated successfully.', data: product });
  } catch (err) {
    next(err);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const deleted = await inventoryService.deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
