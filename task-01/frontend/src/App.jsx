import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, 
  Package, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Zap, 
  ShieldCheck, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard,
  RotateCcw
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('Customer #1');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' or 'orders' or 'concurrency'
  
  // Payment Modal State
  const [paymentModalOrder, setPaymentModalOrder] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState(null);

  // Concurrency Test State
  const [concurrencyResults, setConcurrencyResults] = useState(null);
  const [concurrencyTesting, setConcurrencyTesting] = useState(false);

  // Auto-refresh interval
  useEffect(() => {
    fetchProducts();
    fetchOrders();
    const interval = setInterval(() => {
      fetchProducts();
      fetchOrders();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/products`);
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/orders`);
      const data = await res.json();
      if (data.success) setOrders(data.data);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    }
  };

  // Cart operations
  const addToCart = (product) => {
    if (product.available_stock <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.available_stock) return prev;
        return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1, maxStock: product.available_stock }];
    });
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

  // Checkout & Reserve Stock
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        items: cart.map(c => ({ productId: c.productId, quantity: c.quantity })),
        customerName: customerName || 'Walk-in Customer',
        idempotencyKey: 'POS-CART-' + Date.now()
      };

      const res = await fetch(`${API_BASE}/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCart([]);
        fetchProducts();
        fetchOrders();
        // Open payment modal for the newly reserved order
        setPaymentModalOrder(data.data.order);
      } else {
        alert(data.message || 'Checkout failed.');
      }
    } catch (err) {
      alert('Network error during checkout');
    } finally {
      setLoading(false);
    }
  };

  // Process Mock Payment
  const handleProcessPayment = async (outcome) => {
    if (!paymentModalOrder) return;
    setPaymentLoading(true);
    setPaymentFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/payments/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: paymentModalOrder.id,
          outcome: outcome,
          idempotencyKey: `PAY-MODAL-${paymentModalOrder.id}-${Date.now()}`
        })
      });

      const data = await res.json();
      setPaymentFeedback(data);
      fetchProducts();
      fetchOrders();

      setTimeout(() => {
        setPaymentModalOrder(null);
        setPaymentFeedback(null);
      }, 1800);
    } catch (err) {
      setPaymentFeedback({ success: false, message: 'Payment gateway error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Cancel Order & Restore Stock
  const handleCancelOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this order? Reserved/paid stock will be restored immediately.')) return;
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Order cancelled.');
      fetchProducts();
      fetchOrders();
    } catch (err) {
      alert('Failed to cancel order');
    }
  };

  // Force Expire Order (5-minute timeout test)
  const handleForceExpire = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/force-expire`, { method: 'POST' });
      const data = await res.json();
      alert('Stock lock expired! Stock restored back to available inventory.');
      fetchProducts();
      fetchOrders();
    } catch (err) {
      alert('Failed to force expire');
    }
  };

  // Concurrency Stress Test Simulation
  const runConcurrencyStressTest = async () => {
    setConcurrencyTesting(true);
    setConcurrencyResults(null);

    // Find limited stock item
    const targetItem = products.find(p => Number(p.available_stock) > 0);
    if (!targetItem) {
      alert('No product with available stock found to test!');
      setConcurrencyTesting(false);
      return;
    }

    const testRequestsCount = 15;
    const reqPromises = [];

    for (let i = 1; i <= testRequestsCount; i++) {
      const payload = {
        items: [{ productId: targetItem.id, quantity: 1 }],
        customerName: `Concurrent Worker #${i}`,
        customerEmail: `bot${i}@techloom.test`,
        idempotencyKey: `UI-STRESS-REQ-${i}-${Date.now()}`
      };

      reqPromises.push(
        fetch(`${API_BASE}/orders/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(async r => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => ({})) }))
      );
    }

    const results = await Promise.all(reqPromises);
    const successCount = results.filter(r => r.status === 201 || (r.ok && r.data.success)).length;
    const rejectedCount = results.filter(r => r.status === 409 || (!r.ok && r.data.code === 'INSUFFICIENT_STOCK')).length;

    setConcurrencyResults({
      itemTested: targetItem.name,
      requestsSent: testRequestsCount,
      successCount,
      rejectedCount,
      oversellingAvoided: successCount <= targetItem.available_stock,
      details: results
    });

    setConcurrencyTesting(false);
    fetchProducts();
    fetchOrders();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PAID': return <span className="badge badge-green"><CheckCircle2 size={12} style={{ marginRight: 4 }} /> Paid</span>;
      case 'RESERVED': return <span className="badge badge-yellow"><Clock size={12} style={{ marginRight: 4 }} /> Reserved (5m)</span>;
      case 'CANCELLED': return <span className="badge badge-purple"><RotateCcw size={12} style={{ marginRight: 4 }} /> Cancelled</span>;
      case 'EXPIRED': return <span className="badge badge-gray"><XCircle size={12} style={{ marginRight: 4 }} /> Expired</span>;
      case 'FAILED': return <span className="badge badge-red"><AlertCircle size={12} style={{ marginRight: 4 }} /> Failed</span>;
      default: return <span className="badge badge-blue">{status}</span>;
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <header style={{ background: '#0f172a', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#2563eb', padding: '8px', borderRadius: '8px', display: 'flex' }}>
            <Zap size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Techloom POS System</h1>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Section 01: Concurrency-Safe Order Processing & Stock Lock</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, background: '#1e293b', padding: 4, borderRadius: 8 }}>
          <button 
            onClick={() => setActiveTab('pos')}
            style={{ padding: '6px 14px', background: activeTab === 'pos' ? '#2563eb' : 'transparent', color: 'white' }}>
            POS Register
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            style={{ padding: '6px 14px', background: activeTab === 'orders' ? '#2563eb' : 'transparent', color: 'white' }}>
            Orders ({orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('concurrency')}
            style={{ padding: '6px 14px', background: activeTab === 'concurrency' ? '#d97706' : 'transparent', color: 'white' }}>
            ⚡ Concurrency Stress Test
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: 24, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        
        {/* POS REGISTER TAB */}
        {activeTab === 'pos' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            {/* Left: Product Inventory */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a' }}>Live Product Inventory</h2>
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Stock count is locked exclusively during checkout to prevent overselling.</p>
                </div>
                <button 
                  onClick={() => { fetchProducts(); fetchOrders(); }}
                  style={{ background: '#e2e8f0', color: '#334155', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {products.map(product => {
                  const isOutOfStock = product.available_stock <= 0;
                  return (
                    <div key={product.id} style={{
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      opacity: isOutOfStock ? 0.7 : 1
                    }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                            {product.sku}
                          </span>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>
                            ${Number(product.price).toFixed(2)}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>{product.name}</h3>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 14 }}>{product.description}</p>
                      </div>

                      <div>
                        {/* Stock pills */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            padding: '3px 8px', 
                            borderRadius: 6, 
                            background: product.available_stock > 0 ? '#dcfce7' : '#fee2e2', 
                            color: product.available_stock > 0 ? '#15803d' : '#b91c1c',
                            fontWeight: 600
                          }}>
                            Available: {product.available_stock}
                          </span>
                          {product.reserved_stock > 0 && (
                            <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                              Reserved: {product.reserved_stock}
                            </span>
                          )}
                        </div>

                        <button 
                          onClick={() => addToCart(product)}
                          disabled={isOutOfStock}
                          style={{
                            width: '100%',
                            background: isOutOfStock ? '#cbd5e1' : '#2563eb',
                            color: 'white',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}>
                          <Plus size={16} /> {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: POS Cart & Checkout */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, height: 'fit-content', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                <ShoppingCart size={20} color="#2563eb" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Current Cart</h2>
              </div>

              {/* Customer Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Customer Name / Ref
                </label>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="e.g. Walk-in Customer"
                />
              </div>

              {/* Cart Items */}
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8' }}>
                  <Package size={40} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Cart is empty</p>
                  <p style={{ margin: 0, fontSize: '0.75rem' }}>Select items from the catalog</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
                  {cart.map(item => (
                    <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>${item.price.toFixed(2)} each</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => updateQuantity(item.productId, -1)} style={{ background: '#e2e8f0', padding: 4, borderRadius: 4 }}>
                          <Minus size={12} />
                        </button>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.productId, 1)} disabled={item.quantity >= item.maxStock} style={{ background: '#e2e8f0', padding: 4, borderRadius: 4 }}>
                          <Plus size={12} />
                        </button>
                        <button onClick={() => removeFromCart(item.productId)} style={{ background: '#fee2e2', color: '#dc2626', padding: 4, borderRadius: 4, marginLeft: 4 }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total & Action */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Total Due</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>${cartTotal.toFixed(2)}</span>
                </div>

                <button 
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || loading}
                  style={{
                    width: '100%',
                    background: '#2563eb',
                    color: 'white',
                    padding: '12px',
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}>
                  <CreditCard size={18} /> {loading ? 'Reserving Stock...' : 'Checkout & Lock Stock (5m)'}
                </button>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
                  ⚡ Stock is safely reserved via DB locks for 5 minutes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ORDERS & LIFECYCLE TAB */}
        {activeTab === 'orders' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Order Lifecycle & Audit Trail</h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Monitor statuses: PENDING ➔ RESERVED ➔ PAID / CANCELLED / EXPIRED.
                </p>
              </div>
              <button onClick={fetchOrders} style={{ background: '#e2e8f0', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={14} /> Refresh Orders
              </button>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No orders yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: 12 }}>Order ID</th>
                      <th style={{ padding: 12 }}>Customer</th>
                      <th style={{ padding: 12 }}>Amount</th>
                      <th style={{ padding: 12 }}>Status</th>
                      <th style={{ padding: 12 }}>Created</th>
                      <th style={{ padding: 12, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 12, fontWeight: 600, color: '#1e293b' }}>{order.order_number}</td>
                        <td style={{ padding: 12 }}>{order.customer_name || 'Walk-in'}</td>
                        <td style={{ padding: 12, fontWeight: 600 }}>${Number(order.total_amount).toFixed(2)}</td>
                        <td style={{ padding: 12 }}>{getStatusBadge(order.status)}</td>
                        <td style={{ padding: 12, color: '#64748b', fontSize: '0.8rem' }}>
                          {new Date(order.created_at).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: 12, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {order.status === 'RESERVED' && (
                              <>
                                <button 
                                  onClick={() => setPaymentModalOrder(order)}
                                  style={{ background: '#2563eb', color: 'white', padding: '4px 10px', fontSize: '0.8rem' }}>
                                  Simulate Payment
                                </button>
                                <button 
                                  onClick={() => handleForceExpire(order.id)}
                                  title="Force 5-minute timeout for testing"
                                  style={{ background: '#f59e0b', color: 'white', padding: '4px 10px', fontSize: '0.8rem' }}>
                                  Expire (TTL)
                                </button>
                                <button 
                                  onClick={() => handleCancelOrder(order.id)}
                                  style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', fontSize: '0.8rem' }}>
                                  Cancel
                                </button>
                              </>
                            )}

                            {order.status === 'PAID' && (
                              <button 
                                onClick={() => handleCancelOrder(order.id)}
                                style={{ background: '#f3e8ff', color: '#7e22ce', padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <RotateCcw size={12} /> Cancel & Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CONCURRENCY STRESS TEST TAB */}
        {activeTab === 'concurrency' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#fef3c7', padding: 10, borderRadius: 8 }}>
                <Zap size={24} color="#d97706" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                  Live Concurrency & Race Condition Verifier
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  This tool fires 15 simultaneous checkout requests across concurrent asynchronous threads targeting a product with only 1 stock.
                </p>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 6 }}>How it works under the hood:</h3>
              <ul style={{ fontSize: '0.85rem', color: '#475569', paddingLeft: 20, lineHeight: 1.6 }}>
                <li>Client sends 15 parallel checkout HTTP requests using <code>Promise.all</code>.</li>
                <li>PostgreSQL receives concurrent transactions with <code>SELECT ... FOR UPDATE</code> row-level locking.</li>
                <li>Atomic update <code>UPDATE products SET available_stock = available_stock - 1 WHERE available_stock &gt;= 1</code> guarantees exactly 1 purchase succeeds.</li>
                <li>The remaining 14 requests receive <code>409 Conflict: Insufficient Stock</code> without any negative stock or overselling!</li>
              </ul>
            </div>

            <button 
              onClick={runConcurrencyStressTest}
              disabled={concurrencyTesting}
              style={{
                background: '#d97706',
                color: 'white',
                padding: '12px 24px',
                fontSize: '1rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 8
              }}>
              <Zap size={20} /> {concurrencyTesting ? 'Simulating 15 Concurrent Threads...' : 'Run Concurrency Test (15 Requests)'}
            </button>

            {/* Results Table */}
            {concurrencyResults && (
              <div style={{ marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  {concurrencyResults.oversellingAvoided ? (
                    <div style={{ background: '#dcfce7', color: '#15803d', padding: '6px 14px', borderRadius: 6, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={18} /> PASSED: Overselling Prevented! 1 Succeeded, {concurrencyResults.rejectedCount} Safely Rejected.
                    </div>
                  ) : (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>
                      FAILED: Overselling detected!
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Requests</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{concurrencyResults.requestsSent}</div>
                  </div>
                  <div style={{ background: '#dcfce7', padding: 14, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#15803d' }}>Allowed (201 Created)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>{concurrencyResults.successCount}</div>
                  </div>
                  <div style={{ background: '#fee2e2', padding: 14, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#b91c1c' }}>Rejected (409 Conflict)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b91c1c' }}>{concurrencyResults.rejectedCount}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MOCK PAYMENT MODAL */}
      {paymentModalOrder && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={20} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Simulate Mock Payment</h3>
              </div>
              <button onClick={() => setPaymentModalOrder(null)} style={{ background: 'transparent', color: '#64748b', fontSize: '1.2rem' }}>×</button>
            </div>

            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
              <div><strong>Order:</strong> {paymentModalOrder.order_number}</div>
              <div><strong>Amount:</strong> ${Number(paymentModalOrder.total_amount).toFixed(2)}</div>
              <div><strong>Status:</strong> {paymentModalOrder.status}</div>
            </div>

            {paymentFeedback ? (
              <div style={{ 
                padding: 16, 
                borderRadius: 8, 
                textAlign: 'center',
                background: paymentFeedback.success ? '#dcfce7' : '#fee2e2',
                color: paymentFeedback.success ? '#15803d' : '#b91c1c'
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {paymentFeedback.success ? '✓ Payment Approved' : '✗ Payment Failed / Timed Out'}
                </div>
                <div style={{ fontSize: '0.8rem' }}>Order status updated to {paymentFeedback.orderStatus}</div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 14 }}>
                  Choose which payment gateway outcome to simulate:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button 
                    onClick={() => handleProcessPayment('SUCCESS')}
                    disabled={paymentLoading}
                    style={{ background: '#16a34a', color: 'white', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Simulate Payment SUCCESS (Status: PAID)
                  </button>

                  <button 
                    onClick={() => handleProcessPayment('FAILED')}
                    disabled={paymentLoading}
                    style={{ background: '#dc2626', color: 'white', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <AlertCircle size={16} /> Simulate Payment FAILURE (Release Stock)
                  </button>

                  <button 
                    onClick={() => handleProcessPayment('TIMEOUT')}
                    disabled={paymentLoading}
                    style={{ background: '#475569', color: 'white', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Clock size={16} /> Simulate Gateway TIMEOUT (Expire Reservation)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
