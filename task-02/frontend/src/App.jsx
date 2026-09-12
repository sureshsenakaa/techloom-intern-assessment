import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  ShoppingCart, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Star, 
  Shield, 
  Package, 
  Truck,
  ExternalLink
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  // State
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Cart & UI State
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Checkout & Reservation State
  const [checkoutStep, setCheckoutStep] = useState(null); // null | 'FORM' | 'RESERVED_PAYMENT'
  const [customerInfo, setCustomerInfo] = useState({ name: 'Alex Perera', email: 'alex@example.com', address: '42 Galle Road, Colombo 03' });
  const [activeReservation, setActiveReservation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);

  // Orders History State
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [userOrders, setUserOrders] = useState([]);

  // Fetch initial data
  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [searchQuery, selectedCategory, minPrice, maxPrice, inStockOnly]);

  // Reservation countdown timer
  useEffect(() => {
    if (!activeReservation || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          alert('Your 5-minute stock reservation has expired. The items have been released back to stock.');
          setCheckoutStep(null);
          setActiveReservation(null);
          fetchProducts();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeReservation, timeLeft]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/products/categories`);
      const data = await res.json();
      if (data.success) setCategories(['All', ...data.data]);
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory && selectedCategory !== 'All') params.append('category', selectedCategory);
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);
      if (inStockOnly) params.append('inStock', 'true');

      const res = await fetch(`${API_BASE}/products?${params.toString()}`);
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/orders?email=${encodeURIComponent(customerInfo.email)}`);
      const data = await res.json();
      if (data.success) setUserOrders(data.data);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    }
  };

  // Cart Handlers
  const addToCart = (product, quantity = 1) => {
    if (product.available_stock <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, product.available_stock);
        return prev.map(item => item.productId === product.id ? { ...item, quantity: newQty } : item);
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: Math.min(quantity, product.available_stock),
        imageUrl: product.image_url,
        maxStock: product.available_stock
      }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > item.maxStock) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // Checkout Step 1: Reserve Stock
  const handleInitiateCheckout = async () => {
    if (cart.length === 0) return;
    setIsPaymentProcessing(true);
    try {
      const payload = {
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        shippingAddress: customerInfo.address,
        idempotencyKey: 'CHECKOUT-' + Date.now()
      };

      const res = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActiveReservation(data.data);
        setTimeLeft(data.data.expiresInSeconds || 300);
        setCheckoutStep('RESERVED_PAYMENT');
        setIsCartOpen(false);
        setCart([]); // Cleared because items are now in reservation
        fetchProducts(); // Refresh to reflect reserved stock
      } else {
        alert(data.message || 'Unable to reserve stock for checkout.');
      }
    } catch (err) {
      alert('Network error initiating checkout');
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  // Checkout Step 2: Process Mock Payment
  const handleProcessPayment = async (outcome) => {
    if (!activeReservation) return;
    setIsPaymentProcessing(true);
    setPaymentFeedback(null);

    try {
      const res = await fetch(`${API_BASE}/payments/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeReservation.order.id,
          outcome,
          idempotencyKey: `PAY-${activeReservation.order.id}-${Date.now()}`
        })
      });

      const data = await res.json();
      setPaymentFeedback(data);
      fetchProducts();
      fetchUserOrders();

      if (data.success) {
        setTimeout(() => {
          setCheckoutStep(null);
          setActiveReservation(null);
          setPaymentFeedback(null);
          setIsOrdersOpen(true);
        }, 2200);
      }
    } catch (err) {
      setPaymentFeedback({ success: false, message: 'Payment gateway error' });
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  // Post-Purchase: Cancel Order & Refund
  const handleCancelAndRefund = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this order? Paid amount will be refunded and items returned to stock.')) return;
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Customer cancelled from order history' })
      });

      const data = await res.json();
      alert(data.message || 'Order cancelled.');
      fetchProducts();
      fetchUserOrders();
    } catch (err) {
      alert('Failed to cancel order');
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PAID': return <span className="badge badge-green"><CheckCircle2 size={12} style={{ marginRight: 4 }} /> Paid</span>;
      case 'RESERVED': return <span className="badge badge-yellow"><Clock size={12} style={{ marginRight: 4 }} /> Stock Reserved</span>;
      case 'CANCELLED': return <span className="badge badge-purple"><RotateCcw size={12} style={{ marginRight: 4 }} /> Cancelled & Refunded</span>;
      case 'EXPIRED': return <span className="badge badge-gray"><AlertCircle size={12} style={{ marginRight: 4 }} /> Expired (Stock Released)</span>;
      case 'FAILED': return <span className="badge badge-red"><AlertCircle size={12} style={{ marginRight: 4 }} /> Payment Failed</span>;
      default: return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{ background: '#111827', color: 'white', position: 'sticky', top: 0, zIndex: 40, borderBottom: '1px solid #1f2937' }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#4f46e5', padding: '8px', borderRadius: '10px', display: 'flex' }}>
              <ShoppingBag size={22} color="white" />
            </div>
            <div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Techloom Store</span>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'block' }}>Section 02: Full E-Commerce Flow</span>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ flex: 1, maxWidth: 450, position: 'relative' }}>
            <Search size={18} color="#9ca3af" style={{ position: 'absolute', left: 12, top: 11 }} />
            <input 
              type="text"
              placeholder="Search gadgets, audio, wearables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: 38, background: '#1f2937', color: 'white', border: '1px solid #374151' }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              onClick={() => { fetchUserOrders(); setIsOrdersOpen(true); }}
              style={{ background: '#1f2937', color: 'white', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={16} /> My Orders
            </button>

            <button 
              onClick={() => setIsCartOpen(true)}
              style={{ background: '#4f46e5', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} /> Cart
              {cart.length > 0 && (
                <span style={{ background: 'white', color: '#4f46e5', borderRadius: 999, padding: '1px 6px', fontSize: '0.75rem', fontWeight: 700 }}>
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: 'white', padding: '36px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <span style={{ background: 'rgba(79, 70, 229, 0.3)', border: '1px solid rgba(129, 140, 248, 0.4)', padding: '4px 12px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600 }}>
            ⚡ 5-Minute Guaranteed Stock Reservation & Mock Payments
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginTop: 14, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Next-Gen Gear with Zero-Oversell Checkout
          </h1>
          <p style={{ color: '#c7d2fe', fontSize: '0.95rem', margin: 0 }}>
            Browse authentic products, reserve stock during checkout, simulate realistic payment outcomes, and request instant refunds.
          </p>
        </div>
      </section>

      {/* Main Content Layout */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px', flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 30, width: '100%' }}>
        {/* Filter Sidebar */}
        <aside style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>
            <Filter size={18} color="#4f46e5" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Filters</h2>
          </div>

          {/* Category */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 8 }}>
              Category
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: selectedCategory === cat ? '#eef2ff' : 'transparent',
                    color: selectedCategory === cat ? '#4f46e5' : '#4b5563',
                    fontWeight: selectedCategory === cat ? 700 : 400,
                    borderRadius: 6
                  }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 8 }}>
              Price Range ($)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input 
                type="number" 
                placeholder="Min" 
                value={minPrice} 
                onChange={(e) => setMinPrice(e.target.value)} 
                style={{ width: '100%', fontSize: '0.85rem' }} 
              />
              <span style={{ color: '#9ca3af' }}>-</span>
              <input 
                type="number" 
                placeholder="Max" 
                value={maxPrice} 
                onChange={(e) => setMaxPrice(e.target.value)} 
                style={{ width: '100%', fontSize: '0.85rem' }} 
              />
            </div>
          </div>

          {/* In Stock Only */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={inStockOnly} 
                onChange={(e) => setInStockOnly(e.target.checked)} 
              />
              In Stock Only
            </label>
          </div>
        </aside>

        {/* Product Grid */}
        <main>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
              Showing <strong>{products.length}</strong> products
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading catalog...</div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <Package size={40} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <p>No products match your filters.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
              {products.map(product => {
                const isOutOfStock = product.available_stock <= 0;
                return (
                  <div 
                    key={product.id}
                    style={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}>
                    {/* Image */}
                    <div 
                      onClick={() => setSelectedProduct(product)}
                      style={{ position: 'relative', height: 190, background: '#f3f4f6', cursor: 'pointer', overflow: 'hidden' }}>
                      <img 
                        src={product.image_url} 
                        alt={product.name} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                      <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(17, 24, 39, 0.8)', color: 'white', fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                        {product.category}
                      </span>
                    </div>

                    {/* Content */}
                    <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontSize: '0.8rem', marginBottom: 4 }}>
                          <Star size={14} fill="#f59e0b" />
                          <span style={{ fontWeight: 600 }}>{product.rating || 4.8}</span>
                        </div>
                        <h3 
                          onClick={() => setSelectedProduct(product)}
                          style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 6px', cursor: 'pointer' }}>
                          {product.name}
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {product.description}
                        </p>
                      </div>

                      <div>
                        {/* Price & Stock info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827' }}>
                            ${Number(product.price).toFixed(2)}
                          </span>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: product.available_stock > 1 ? '#dcfce7' : product.available_stock === 1 ? '#fef3c7' : '#fee2e2',
                            color: product.available_stock > 1 ? '#15803d' : product.available_stock === 1 ? '#b45309' : '#b91c1c'
                          }}>
                            {product.available_stock > 0 ? `${product.available_stock} in stock` : 'Out of stock'}
                          </span>
                        </div>

                        <button 
                          onClick={() => addToCart(product)}
                          disabled={isOutOfStock}
                          style={{
                            width: '100%',
                            background: isOutOfStock ? '#d1d5db' : '#4f46e5',
                            color: 'white',
                            padding: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}>
                          <Plus size={16} /> {isOutOfStock ? 'Sold Out' : 'Add to Cart'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 650, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ height: '100%', background: '#f3f4f6' }}>
              <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>
                    {selectedProduct.category}
                  </span>
                  <button onClick={() => setSelectedProduct(null)} style={{ background: 'transparent', color: '#9ca3af', fontSize: '1.2rem' }}>×</button>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>{selectedProduct.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontSize: '0.85rem', marginBottom: 12 }}>
                  <Star size={14} fill="#f59e0b" />
                  <span style={{ fontWeight: 600 }}>{selectedProduct.rating} Rating</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.6, marginBottom: 16 }}>
                  {selectedProduct.description}
                </p>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: 12 }}>
                  ${Number(selectedProduct.price).toFixed(2)}
                </div>
                <div style={{ fontSize: '0.8rem', color: selectedProduct.available_stock > 0 ? '#15803d' : '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                  ✓ {selectedProduct.available_stock} units available in warehouse
                </div>
              </div>

              <button 
                onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }}
                disabled={selectedProduct.available_stock <= 0}
                style={{
                  width: '100%',
                  background: selectedProduct.available_stock <= 0 ? '#d1d5db' : '#4f46e5',
                  color: 'white',
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}>
                <ShoppingCart size={18} /> Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {isCartOpen && (
        <div className="drawer-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCart size={20} color="#4f46e5" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Shopping Cart ({cart.length})</h2>
              </div>
              <button onClick={() => setIsCartOpen(false)} style={{ background: 'transparent', color: '#9ca3af', fontSize: '1.2rem' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                  <ShoppingBag size={48} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Your cart is empty</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>Explore items to get started.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {cart.map(item => (
                    <div key={item.productId} style={{ display: 'flex', gap: 12, border: '1px solid #e5e7eb', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                      <img src={item.imageUrl} alt={item.name} style={{ width: 54, height: 54, borderRadius: 6, objectFit: 'cover' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>${item.price.toFixed(2)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <button onClick={() => updateQuantity(item.productId, -1)} style={{ background: '#f3f4f6', padding: 3, borderRadius: 4 }}><Minus size={12} /></button>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.productId, 1)} disabled={item.quantity >= item.maxStock} style={{ background: '#f3f4f6', padding: 3, borderRadius: 4 }}><Plus size={12} /></button>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.productId)} style={{ background: '#fee2e2', color: '#ef4444', padding: 6, borderRadius: 6 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ padding: 20, borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ color: '#4b5563', fontWeight: 600 }}>Subtotal</span>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827' }}>${cartTotal.toFixed(2)}</span>
                </div>
                <button 
                  onClick={() => { setIsCartOpen(false); setCheckoutStep('FORM'); }}
                  style={{
                    width: '100%',
                    background: '#4f46e5',
                    color: 'white',
                    padding: 12,
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}>
                  Proceed to Checkout <ExternalLink size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHECKOUT STEP 1: CUSTOMER FORM MODAL */}
      {checkoutStep === 'FORM' && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={20} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Shipping & Checkout</h3>
              </div>
              <button onClick={() => setCheckoutStep(null)} style={{ background: 'transparent', color: '#9ca3af', fontSize: '1.2rem' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Full Name</label>
                <input 
                  type="text" 
                  value={customerInfo.name} 
                  onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })} 
                  style={{ width: '100%' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Email (for Order History tracking)</label>
                <input 
                  type="email" 
                  value={customerInfo.email} 
                  onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })} 
                  style={{ width: '100%' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Delivery Address</label>
                <input 
                  type="text" 
                  value={customerInfo.address} 
                  onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })} 
                  style={{ width: '100%' }} 
                />
              </div>
            </div>

            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Total Items:</span>
                <strong>{cart.reduce((a, b) => a + b.quantity, 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total Amount:</span>
                <strong style={{ color: '#4f46e5', fontSize: '1.1rem' }}>${cartTotal.toFixed(2)}</strong>
              </div>
            </div>

            <button 
              onClick={handleInitiateCheckout}
              disabled={isPaymentProcessing}
              style={{
                width: '100%',
                background: '#4f46e5',
                color: 'white',
                padding: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}>
              <Shield size={18} /> {isPaymentProcessing ? 'Locking Stock in DB...' : 'Reserve Stock & Proceed to Payment'}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
              🔒 Stock is reserved for 5 minutes. If unpaid, it auto-releases to other shoppers.
            </p>
          </div>
        </div>
      )}

      {/* CHECKOUT STEP 2: STOCK RESERVATION ACTIVE & MOCK PAYMENT GATEWAY */}
      {checkoutStep === 'RESERVED_PAYMENT' && activeReservation && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ padding: 24 }}>
            {/* 5-Minute Countdown Banner */}
            <div style={{ 
              background: '#fef3c7', 
              border: '1px solid #fde68a', 
              padding: 14, 
              borderRadius: 10, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: 18 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={22} color="#d97706" />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>Stock Reserved Exclusively For You</div>
                  <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Complete payment before timer expires</div>
                </div>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b45309', fontFamily: 'monospace' }}>
                {formatTimer(timeLeft)}
              </div>
            </div>

            <div style={{ background: '#f9fafb', padding: 14, borderRadius: 10, marginBottom: 18, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Order Number:</span>
                <strong>{activeReservation.order.order_number}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Customer:</span>
                <span>{customerInfo.name} ({customerInfo.email})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Amount to Pay:</span>
                <strong style={{ fontSize: '1.2rem', color: '#111827' }}>${Number(activeReservation.order.total_amount).toFixed(2)}</strong>
              </div>
            </div>

            {/* Payment Feedback */}
            {paymentFeedback ? (
              <div style={{
                padding: 16,
                borderRadius: 10,
                textAlign: 'center',
                background: paymentFeedback.success ? '#dcfce7' : '#fee2e2',
                color: paymentFeedback.success ? '#15803d' : '#b91c1c',
                marginBottom: 16
              }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                  {paymentFeedback.success ? '✓ Payment Successful!' : '✗ Payment Failed / Timed Out'}
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  {paymentFeedback.success 
                    ? 'Order placed! Redirecting to your Order History...' 
                    : 'Reserved stock has been safely released back to available inventory.'}
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                  Simulate Payment Gateway Outcome:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button 
                    onClick={() => handleProcessPayment('SUCCESS')}
                    disabled={isPaymentProcessing}
                    style={{ background: '#10b981', color: 'white', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <CheckCircle2 size={18} /> Simulate Payment SUCCESS (Status: PAID)
                  </button>

                  <button 
                    onClick={() => handleProcessPayment('FAILED')}
                    disabled={isPaymentProcessing}
                    style={{ background: '#ef4444', color: 'white', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <AlertCircle size={18} /> Simulate Payment DECLINE / FAILURE (Stock Released)
                  </button>

                  <button 
                    onClick={() => handleProcessPayment('TIMEOUT')}
                    disabled={isPaymentProcessing}
                    style={{ background: '#6b7280', color: 'white', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Clock size={18} /> Simulate Payment TIMEOUT (Reservation Expired)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MY ORDERS & REFUNDS MODAL */}
      {isOrdersOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 700, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={22} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Order History & Refunds</h3>
              </div>
              <button onClick={() => setIsOrdersOpen(false)} style={{ background: 'transparent', color: '#9ca3af', fontSize: '1.2rem' }}>×</button>
            </div>

            <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {userOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No orders found for this email.</div>
              ) : (
                userOrders.map(order => (
                  <div key={order.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>{order.order_number}</span>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>
                          Placed on {new Date(order.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div>{getStatusBadge(order.status)}</div>
                    </div>

                    <div style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '8px 0', margin: '8px 0', fontSize: '0.8rem' }}>
                      {order.items?.map(it => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                          <span>{it.quantity}x {it.product_name}</span>
                          <span>${Number(it.subtotal).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#111827' }}>Total: ${Number(order.total_amount).toFixed(2)}</span>

                      {/* Cancel & Refund Button */}
                      {order.status === 'PAID' && (
                        <button 
                          onClick={() => handleCancelAndRefund(order.id)}
                          style={{ background: '#f3e8ff', color: '#7e22ce', padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <RotateCcw size={14} /> Request Cancellation & Refund
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
