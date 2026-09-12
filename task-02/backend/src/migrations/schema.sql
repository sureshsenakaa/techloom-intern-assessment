-- E-Commerce Storefront Database Schema

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  available_stock INT NOT NULL DEFAULT 0 CHECK (available_stock >= 0),
  reserved_stock INT NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  rating NUMERIC(2, 1) DEFAULT 4.8,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  order_number VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RESERVED' 
    CHECK (status IN ('PENDING', 'RESERVED', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED')),
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  shipping_address TEXT,
  idempotency_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' 
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'RELEASED')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILED', 'TIMEOUT')),
  status VARCHAR(32) NOT NULL CHECK (status IN ('PAID', 'FAILED', 'TIMEOUT')),
  refund_amount NUMERIC(10, 2) DEFAULT 0.00,
  gateway_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_products_cat ON products(category);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_ecom_reservations_status_expires ON reservations(status, expires_at);
