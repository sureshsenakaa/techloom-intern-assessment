const db = require('../config/db');

class CatalogService {
  async searchProducts({ search, category, minPrice, maxPrice, inStock }) {
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let idx = 1;

    if (search && search.trim()) {
      sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(description) LIKE $${idx})`;
      params.push(`%${search.trim().toLowerCase()}%`);
      idx++;
    }

    if (category && category.trim() && category !== 'All') {
      sql += ` AND category = $${idx}`;
      params.push(category.trim());
      idx++;
    }

    if (minPrice !== undefined && minPrice !== '') {
      sql += ` AND price >= $${idx}`;
      params.push(Number(minPrice));
      idx++;
    }

    if (maxPrice !== undefined && maxPrice !== '') {
      sql += ` AND price <= $${idx}`;
      params.push(Number(maxPrice));
      idx++;
    }

    if (inStock === 'true' || inStock === true) {
      sql += ` AND available_stock > 0`;
    }

    sql += ' ORDER BY id ASC';

    const res = await db.query(sql, params);
    return res.rows;
  }

  async getProductByIdOrSlug(identifier) {
    let res;
    if (!isNaN(identifier)) {
      res = await db.query('SELECT * FROM products WHERE id = $1', [parseInt(identifier, 10)]);
    } else {
      res = await db.query('SELECT * FROM products WHERE slug = $1', [identifier]);
    }
    return res.rows[0] || null;
  }

  async getCategories() {
    const res = await db.query('SELECT DISTINCT category FROM products ORDER BY category ASC');
    return res.rows.map(r => r.category);
  }
}

module.exports = new CatalogService();
