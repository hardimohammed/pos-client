// ============================================================
//  pos-client/src/screens/POSMainScreen.jsx
//  Main POS interface — product grid + cart sidebar
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import ProductGrid      from '../components/ProductGrid';
import CartSidebar      from '../components/CartSidebar';
import PaymentModal     from '../components/PaymentModal';
import ReceiptModal     from '../components/ReceiptModal';
import RefundModal      from '../components/RefundModal';
import ParkedSalesModal from '../components/ParkedSalesModal';
import ShiftManager     from './ShiftManager';
import {
  queueOfflineSale, getUnsyncedSales, markSynced, removeQueuedSale, unsyncedCount,
  markFailed, getFailedSales, failedCount, clearFailedFlag,
} from '../db/offlineDb';

const fmtCur = (n) =>
  `GH₵ ${parseFloat(n||0).toFixed(2)}`;

// Picks the first candidate that's genuinely set (not null/undefined),
// not the first truthy one — a `||` cascade would treat an explicit,
// intentional 0 (e.g. a variant priced as a free promo/display item)
// as "not set" and silently charge the next, wrong, nonzero price.
const variantPrice = (product, variant) => {
  const candidates = [variant?.retail_price, variant?.selling_price, product.retail_price, product.selling_price];
  const found = candidates.find(v => v !== null && v !== undefined);
  return found !== undefined ? parseFloat(found) : 0;
};

export default function POSMainScreen({
  apiBase, token, cashier, session, socket, onCloseShift, onLogout,
}) {
  const [products,      setProducts]      = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [cart,          setCart]          = useState([]);
  const [search,        setSearch]        = useState('');
  const [activeCategory,setActiveCategory]= useState(null);
  const [loading,       setLoading]       = useState(true);
  const [showPayment,   setShowPayment]   = useState(false);
  const [showReceipt,   setShowReceipt]   = useState(false);
  const [lastSale,      setLastSale]      = useState(null);
  const [showShiftClose,setShowShiftClose]= useState(false);
  const [showRefund,    setShowRefund]    = useState(false);
  const [showParked,    setShowParked]    = useState(false);
  const [discount,      setDiscount]      = useState(0);
  const [discountType,  setDiscountType]  = useState('flat'); // 'flat' (GHS) or 'percentage'
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [pendingSync,   setPendingSync]   = useState(0);
  const [syncing,       setSyncing]       = useState(false);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [showFailedSync,  setShowFailedSync]  = useState(false);
  const [failedSales,     setFailedSales]     = useState([]);

  const authH = { Authorization: `Bearer ${token}` };

  const refreshPendingCount = useCallback(() => {
    unsyncedCount().then(setPendingSync).catch(() => {});
    failedCount().then(setFailedSyncCount).catch(() => {});
  }, []);

  const refreshFailedSales = useCallback(() => {
    getFailedSales().then(setFailedSales).catch(() => {});
  }, []);

  // Mirrors, locally, exactly what the server would deduct once this
  // sale actually reaches it — the grid otherwise stays frozen at
  // pre-outage quantities for as long as the terminal is offline, so
  // a cashier ringing up the same item twice sees no warning that
  // they're about to (or already did) oversell it. This is a
  // best-effort local estimate, not a new source of truth: the
  // server's own atomic stock check on sync is still what actually
  // decides whether the sale is valid.
  const applyOptimisticStockDecrement = useCallback((cartItems) => {
    setProducts(prev => {
      const next = prev.map(p => ({ ...p, variants: p.variants ? p.variants.map(v => ({ ...v })) : p.variants }));
      for (const item of cartItems) {
        const product = next.find(p => p.id === item.productId);
        if (!product) continue;
        if (item.variantId && product.variants) {
          const variant = product.variants.find(v => v.id === item.variantId);
          if (variant) variant.quantity_on_hand = Math.max(0, parseFloat(variant.quantity_on_hand || 0) - item.quantity);
        } else {
          product.stock = Math.max(0, parseFloat(product.stock || 0) - item.quantity);
        }
      }
      try { localStorage.setItem('pos_products_cache', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Sync queued offline sales once back online ────────────
  const syncOfflineSales = useCallback(async () => {
    const queued = await getUnsyncedSales();
    if (!queued.length) return;
    setSyncing(true);
    for (const entry of queued) {
      try {
        const res = await fetch(`${apiBase}/pos/sales`, {
          method: 'POST',
          headers: { ...authH, 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.payload),
        });
        const data = await res.json();
        if (data.success) {
          await markSynced(entry.offlineId);
          await removeQueuedSale(entry.offlineId);
        } else {
          // The server actually processed this request and said no —
          // most commonly real stock ran out from under the optimistic
          // local estimate (e.g. another terminal sold the last units
          // while this one was offline). That's a genuine business
          // problem, not a network hiccup: retrying it automatically
          // on every future reconnect would just fail again forever
          // while looking, in the UI, identical to "still waiting for
          // a connection." Stop auto-retrying this one and flag it for
          // a human to actually look at.
          await markFailed(entry.offlineId, data.message || 'Sale was rejected by the server');
        }
      } catch {
        break; // still offline or server unreachable — stop for now
      }
    }
    refreshPendingCount();
    refreshFailedSales();
    setSyncing(false);
  }, [apiBase, token, refreshPendingCount, refreshFailedSales]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-queues a specific failed sale for another sync attempt (e.g.
  // after a manager has restocked the item) without waiting for the
  // next full online/offline cycle.
  const handleRetryFailed = async (offlineId) => {
    await clearFailedFlag(offlineId);
    refreshFailedSales();
    refreshPendingCount();
    syncOfflineSales();
  };

  // Permanently gives up on a failed offline sale — the server never
  // recorded it and never will. The local stock estimate already
  // reflects it being sold, so discarding doesn't restore that
  // quantity; a manager who discards this should reconcile stock
  // manually if the sale truly didn't happen.
  const handleDiscardFailed = async (offlineId) => {
    if (!window.confirm('Discard this failed sale permanently? It was never recorded on the server — this cannot be undone.')) return;
    await removeQueuedSale(offlineId);
    refreshFailedSales();
    refreshPendingCount();
  };

  useEffect(() => {
    refreshPendingCount();
    refreshFailedSales();
    const handleOnline  = () => { setIsOnline(true); syncOfflineSales(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) syncOfflineSales();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineSales, refreshPendingCount, refreshFailedSales]);

  // ── Load products ────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit:200 });
      if (search)        params.set('search', search);
      if (activeCategory)params.set('categoryId', activeCategory);

      const [pRes, cRes] = await Promise.all([
        fetch(`${apiBase}/pos/products?${params}`,
          { headers: authH }),
        fetch(`${apiBase}/pos/products/categories`,
          { headers: authH }),
      ]);
      const pData = await pRes.json();
      const cData = await cRes.json();
      setProducts(pData.data || []);
      setCategories(cData.data || []);

      // Cache for offline use
      try {
        localStorage.setItem('pos_products_cache',
          JSON.stringify(pData.data || []));
      } catch {}
    } catch {
      // Load from cache if offline
      const cached = localStorage.getItem('pos_products_cache');
      if (cached) setProducts(JSON.parse(cached));
    } finally { setLoading(false); }
  }, [search, activeCategory, apiBase, token]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Stock can change for reasons this terminal never sees directly —
  // a sale on a different POS terminal, or a manual adjustment made
  // in the accounting-client Inventory page — so listen for the same
  // stock_updated event the Inventory page already reacts to, instead
  // of only refreshing after this terminal's own sales/refunds.
  useEffect(() => {
    if (!socket) return;
    socket.on('stock_updated', loadProducts);
    return () => socket.off('stock_updated', loadProducts);
  }, [socket, loadProducts]);

  // ── Cart operations ───────────────────────────────────────
  const addToCart = (product, variant = null) => {
    setCart(prev => {
      const key    = variant
        ? `${product.id}-${variant.id}`
        : `${product.id}`;
      const exists = prev.find(i => i.key === key);
      const price  = variantPrice(product, variant);
      const stock  = variant
        ? parseFloat(variant.quantity_on_hand || 0)
        : parseFloat(product.stock || 0);

      if (exists) {
        if (exists.quantity >= stock && stock > 0) {
          alert(`Only ${stock} ${product.unit_of_measure} in stock`);
          return prev;
        }
        return prev.map(i =>
          i.key === key
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }

      if (stock <= 0 && product.product_type === 'inventory') {
        if (!window.confirm(
          `${product.name} is out of stock. Add anyway?`
        )) return prev;
      }

      return [...prev, {
        key,
        productId:   product.id,
        variantId:   variant?.id || null,
        name:        product.name,
        variantLabel: variant
          ? [variant.size, variant.color]
              .filter(Boolean).join(' / ')
          : null,
        sku:         variant?.sku || product.sku,
        unitPrice:   price,
        costPrice:   parseFloat(
          variant?.cost_price || product.cost_price || 0),
        taxRate:     parseFloat(product.tax_rate || 0),
        quantity:    1,
        discountPct: 0,
        stock,
        image:       variant?.image_url || product.image_url,
        productType: product.product_type,
      }];
    });
  };

  const updateQty = (key, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.key !== key));
      return;
    }
    setCart(prev => prev.map(i =>
      i.key === key ? { ...i, quantity: qty } : i
    ));
  };

  const updateDiscount = (key, pct) => {
    setCart(prev => prev.map(i =>
      i.key === key
        ? { ...i, discountPct: Math.min(100, Math.max(0, pct)) }
        : i
    ));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setDiscountType('flat');
  };

  // ── Totals ────────────────────────────────────────────────
  // Item-level discounts (per cart line, %) reduce each line's own
  // tax base already. The order-level discount (flat GHS or %,
  // picked via discountType) is applied on top — scaling every
  // line's net + tax by the same factor is mathematically identical
  // to prorating it across lines by their share of the subtotal and
  // recomputing tax on the reduced amount, so mixed tax rates in one
  // cart still come out correct. Mirrors the backend's calculation
  // in pos.routes.js exactly, so this preview matches what actually
  // gets charged.
  const itemDiscountTotal = cart.reduce((s, i) => {
    const gross = i.unitPrice * i.quantity;
    return s + gross * (i.discountPct / 100);
  }, 0);

  const itemNetSubtotal = cart.reduce((s, i) => {
    const gross   = i.unitPrice * i.quantity;
    const discAmt = gross * (i.discountPct / 100);
    return s + (gross - discAmt);
  }, 0);

  const itemTaxTotal = cart.reduce((s, i) => {
    const gross   = i.unitPrice * i.quantity;
    const discAmt = gross * (i.discountPct / 100);
    const net     = gross - discAmt;
    return s + (net * (i.taxRate / 100));
  }, 0);

  const discountValue = Math.max(0, parseFloat(discount) || 0);
  const orderDiscount = discountType === 'percentage'
    ? itemNetSubtotal * (Math.min(100, discountValue) / 100)
    : Math.min(itemNetSubtotal, discountValue);

  const discountFactor = itemNetSubtotal > 0
    ? (itemNetSubtotal - orderDiscount) / itemNetSubtotal
    : 1;

  const subtotal      = itemNetSubtotal - orderDiscount;
  const taxTotal       = itemTaxTotal * discountFactor;
  const total          = subtotal + taxTotal;
  const totalDiscount  = itemDiscountTotal + orderDiscount;
  const itemCount      = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Complete sale ─────────────────────────────────────────
  const handleSaleComplete = async (paymentData) => {
    // Generated once, up front, and carried through every attempt at
    // recording *this* checkout — including the very first live one,
    // not just an offline-queue fallback. If the live fetch's request
    // reaches the server (sale created, stock deducted, and for
    // mobile money a real Paystack charge fired) but its response is
    // lost to a network drop before it gets back here, the code below
    // used to treat that as "never happened" and queue a fresh retry
    // with a brand-new id — which the server had no way to link back
    // to the first attempt, so it just created a second sale (and, on
    // mobile money, charged the customer twice). Reusing the same id
    // for the retry lets the server's offlineId dedup recognize it as
    // the same sale and hand back the original instead of duplicating it.
    const clientSaleId = crypto.randomUUID();
    const payload = {
      sessionId:     session.id,
      customerId:    paymentData.customerId || null,
      customerName:  paymentData.customerName || 'Walk-in Customer',
      items: cart.map(i => ({
        productId:    i.productId,
        variantId:    i.variantId,
        variantLabel: i.variantLabel,
        unitPrice:    i.unitPrice,
        quantity:     i.quantity,
        discountPct:  i.discountPct,
      })),
      paymentMethod: paymentData.method,
      payments:      paymentData.payments || null,
      amountTendered: paymentData.amountTendered,
      changeGiven:   paymentData.changeGiven,
      discountAmount: discountValue,
      discountType,
      notes:         paymentData.notes,
      momoPhone:     paymentData.momoPhone || undefined,
      momoProvider:  paymentData.momoProvider || undefined,
      offlineId:     clientSaleId,
    };

    // No point even trying the network if we already know we're offline.
    if (!navigator.onLine) {
      await queueOfflineSale(payload, clientSaleId);
      applyOptimisticStockDecrement(cart);
      refreshPendingCount();
      setLastSale({
        saleNumber: 'OFFLINE (pending sync)', totalAmount: total,
        paymentStatus: 'pending', items: cart, total, offline: true,
      });
      setShowPayment(false);
      setShowReceipt(true);
      clearCart();
      return;
    }

    let res, data;
    try {
      res = await fetch(`${apiBase}/pos/sales`, {
        method:  'POST',
        headers: { ...authH, 'Content-Type':'application/json' },
        body:    JSON.stringify(payload),
      });
      data = await res.json();
    } catch (networkErr) {
      // The request may or may not have actually reached the server —
      // that ambiguity is exactly why clientSaleId is reused rather
      // than regenerated here.
      await queueOfflineSale(payload, clientSaleId);
      applyOptimisticStockDecrement(cart);
      refreshPendingCount();
      setLastSale({
        saleNumber: 'OFFLINE (pending sync)', totalAmount: total,
        paymentStatus: 'pending', items: cart, total, offline: true,
      });
      setShowPayment(false);
      setShowReceipt(true);
      clearCart();
      return;
    }

    if (!data.success) {
      alert(`Sale failed: ${data.message || 'unknown error'}`);
      return;
    }

    const charge = data.data.paystackCharge;
    if (charge && charge.status !== 'success') {
      alert(charge.status === 'failed'
        ? `Mobile Money charge failed: ${charge.error || 'please try again or use another method'}`
        : 'Ask the customer to check their phone to approve the payment. The sale will confirm automatically once they do.');
    }

    // Split sale — each mobile_money leg is its own real charge now,
    // so it needs the same "check your phone" / "declined" feedback
    // the non-split flow already gives, per leg that isn't done yet.
    const unresolvedLegs = (data.data.payments || []).filter(p => p.chargeStatus && p.chargeStatus !== 'success');
    if (unresolvedLegs.length > 0) {
      const lines = unresolvedLegs.map(p => p.chargeStatus === 'failed'
        ? `Mobile Money (${p.amount}): failed — ${p.chargeError || 'please try again or collect this portion another way'}`
        : `Mobile Money (${p.amount}): ask the customer to check their phone to approve`);
      alert(`This sale isn't fully confirmed yet:\n\n${lines.join('\n')}\n\nIt will complete automatically once resolved.`);
    }

    setLastSale({ ...data.data, items: cart, total });
    setShowPayment(false);
    setShowReceipt(true);
    clearCart();
    loadProducts(); // stock was just deducted server-side — refresh displayed quantities
  };

  // ── Hold / park the current cart ───────────────────────────
  const handleHold = async () => {
    const label = window.prompt('Label this held sale (optional) — e.g. customer name:', '');
    if (label === null) return; // cancelled

    try {
      const res  = await fetch(`${apiBase}/pos/parked-sales`, {
        method:  'POST',
        headers: { ...authH, 'Content-Type':'application/json' },
        body:    JSON.stringify({
          sessionId: session.id,
          label:     label || null,
          cart,
          discountAmount: discountValue,
          discountType,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not hold this sale');
      clearCart();
    } catch (err) {
      alert(`Could not hold sale: ${err.message}`);
    }
  };

  // ── Resume a previously held cart ──────────────────────────
  const handleResumeParked = (resumed) => {
    setCart(resumed.cart || []);
    setDiscount(resumed.discountAmount || 0);
    setDiscountType(resumed.discountType || 'flat');
  };

  return (
    <div style={{ display:'flex', height:'100vh',
      fontFamily:'system-ui, sans-serif',
      background:'#f4f6f9' }}>

      {/* ── Left: Product area ──────────────────────────── */}
      <div style={{ flex:1, display:'flex',
        flexDirection:'column', overflow:'hidden' }}>

        {/* Top bar */}
        <div style={{ background:'#0d1b2a',
          padding:'12px 20px',
          display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:36, height:36,
            borderRadius:10,
            background:'linear-gradient(135deg,#1e6bbd,#3d9fff)',
            display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:16,
            fontWeight:800, color:'white', flexShrink:0 }}>
            F
          </div>
          <div style={{ flex:1 }}>
            <input
              placeholder="Search products or scan barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width:'100%', padding:'10px 16px',
                border:'none', borderRadius:10, fontSize:14,
                background:'rgba(255,255,255,.1)',
                color:'white', outline:'none',
                fontFamily:'system-ui',
                boxSizing:'border-box' }}/>
          </div>
          {(!isOnline || pendingSync > 0) && (
            <div style={{ padding:'6px 12px', borderRadius:8, flexShrink:0,
              background: !isOnline ? 'rgba(224,92,92,.2)' : 'rgba(232,160,74,.2)',
              color: !isOnline ? '#ff8080' : '#e8a04a',
              fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
              {!isOnline ? '⚠ Offline' : syncing ? '⟳ Syncing…' : `⏳ ${pendingSync} sale${pendingSync!==1?'s':''} pending sync`}
            </div>
          )}
          {failedSyncCount > 0 && (
            <button onClick={() => setShowFailedSync(true)}
              style={{ padding:'6px 12px', borderRadius:8, flexShrink:0, border:'none', cursor:'pointer',
                background:'rgba(224,92,92,.25)', color:'#ff8080',
                fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6, fontFamily:'sans-serif' }}>
              ⚠ {failedSyncCount} sale{failedSyncCount!==1?'s':''} failed to sync — review
            </button>
          )}
          <div style={{ fontSize:12, color:'rgba(255,255,255,.6)',
            textAlign:'right', flexShrink:0 }}>
            <div style={{ color:'white', fontWeight:600 }}>
              {cashier?.first_name} {cashier?.last_name}
            </div>
            <div>{session?.terminal_name || 'Main Till'}</div>
          </div>
          <button
            onClick={() => setShowParked(true)}
            style={{ padding:'8px 14px', borderRadius:8,
              border:'1px solid rgba(255,255,255,.2)',
              background:'none', color:'rgba(255,255,255,.7)',
              fontSize:12, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            Held Sales
          </button>
          <button
            onClick={() => setShowRefund(true)}
            style={{ padding:'8px 14px', borderRadius:8,
              border:'1px solid rgba(255,255,255,.2)',
              background:'none', color:'rgba(255,255,255,.7)',
              fontSize:12, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            Refund
          </button>
          <button
            onClick={() => setShowShiftClose(true)}
            style={{ padding:'8px 14px', borderRadius:8,
              border:'1px solid rgba(255,255,255,.2)',
              background:'none', color:'rgba(255,255,255,.7)',
              fontSize:12, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            Close Shift
          </button>
          {/* Separate from Close Shift — that's a cash-reconciliation
              step for ending the day, not a quick way to hand the
              terminal to a different cashier. This just signs out of
              the browser; the shift stays open server-side and picks
              back up automatically next time this cashier logs in. */}
          <button
            onClick={() => {
              if (window.confirm('Sign out of this terminal? Your shift stays open and will resume next time you log in.'))
                onLogout();
            }}
            style={{ padding:'8px 14px', borderRadius:8,
              border:'1px solid rgba(255,255,255,.2)',
              background:'none', color:'rgba(255,255,255,.7)',
              fontSize:12, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            Logout
          </button>
        </div>

        {/* Category tabs */}
        <div style={{ background:'white',
          borderBottom:'1px solid #e2e8f0',
          padding:'8px 16px', display:'flex',
          gap:8, overflowX:'auto' }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{ padding:'7px 16px', borderRadius:20,
              border:'none', cursor:'pointer',
              fontSize:13, fontWeight:600, flexShrink:0,
              background: !activeCategory
                ? '#1e6bbd' : '#f4f6f9',
              color: !activeCategory ? 'white' : '#6b7fa3' }}>
            All
          </button>
          {categories.map(c => (
            <button key={c.id}
              onClick={() => setActiveCategory(c.id)}
              style={{ padding:'7px 16px', borderRadius:20,
                border:'none', cursor:'pointer',
                fontSize:13, fontWeight:600, flexShrink:0,
                background: activeCategory===c.id
                  ? '#1e6bbd' : '#f4f6f9',
                color: activeCategory===c.id
                  ? 'white' : '#6b7fa3' }}>
              {c.name}
              <span style={{ marginLeft:6, opacity:.7,
                fontSize:11 }}>({c.product_count})</span>
            </button>
          ))}
        </div>

        {/* Product grid */}
        <ProductGrid
          products={products}
          loading={loading}
          onAddToCart={addToCart}
          apiBase={apiBase}
          token={token}/>
      </div>

      {/* ── Right: Cart sidebar ──────────────────────────── */}
      <CartSidebar
        cart={cart}
        subtotal={subtotal}
        taxTotal={taxTotal}
        discount={discount}
        discountType={discountType}
        totalDiscount={totalDiscount}
        total={total}
        itemCount={itemCount}
        onUpdateQty={updateQty}
        onUpdateDiscount={updateDiscount}
        onOrderDiscount={setDiscount}
        onOrderDiscountType={setDiscountType}
        onClear={clearCart}
        onCheckout={() => setShowPayment(true)}
        onHold={handleHold}
        fmtCur={fmtCur}/>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          total={total}
          cart={cart}
          apiBase={apiBase}
          token={token}
          fmtCur={fmtCur}
          onComplete={handleSaleComplete}
          onClose={() => setShowPayment(false)}/>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <ReceiptModal
          sale={lastSale}
          fmtCur={fmtCur}
          cashier={cashier}
          onClose={() => {
            setShowReceipt(false);
            setLastSale(null);
          }}/>
      )}

      {/* Refund Modal */}
      {showRefund && (
        <RefundModal
          apiBase={apiBase}
          token={token}
          fmtCur={fmtCur}
          onClose={() => setShowRefund(false)}
          onRefunded={() => loadProducts()}/>
      )}

      {/* Held Sales Modal */}
      {showParked && (
        <ParkedSalesModal
          apiBase={apiBase}
          token={token}
          fmtCur={fmtCur}
          hasActiveCart={cart.length > 0}
          onClose={() => setShowParked(false)}
          onResume={handleResumeParked}/>
      )}

      {/* Close Shift */}
      {showShiftClose && (
        <ShiftManager
          mode="close"
          session={session}
          apiBase={apiBase}
          token={token}
          cashier={cashier}
          onSessionClosed={onCloseShift}
          onCancel={() => setShowShiftClose(false)}/>
      )}

      {/* Failed Offline Sales Review */}
      {showFailedSync && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,27,42,.6)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:20 }}
          onClick={e => e.target===e.currentTarget && setShowFailedSync(false)}>
          <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:560,
            maxHeight:'85vh', overflow:'auto', boxShadow:'0 20px 60px rgba(13,27,42,.25)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'18px 24px', borderBottom:'1px solid #e2e8f0' }}>
              <span style={{ fontSize:16, fontWeight:700 }}>Failed Offline Sales</span>
              <button onClick={() => setShowFailedSync(false)}
                style={{ background:'none', border:'none', fontSize:22, color:'#6b7fa3',
                  cursor:'pointer', lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              <p style={{ fontSize:12.5, color:'#6b7fa3', marginBottom:16 }}>
                These sales were made while offline but rejected by the server once reconnected —
                most often because real stock ran out from under the estimate this terminal was
                showing (e.g. another till sold the last units in the meantime). They will not
                retry automatically.
              </p>
              {failedSales.length === 0 ? (
                <div style={{ textAlign:'center', padding:30, color:'#6b7fa3', fontSize:13 }}>Nothing to review.</div>
              ) : failedSales.map(entry => (
                <div key={entry.offlineId} style={{ border:'1px solid #e2e8f0', borderRadius:10,
                  padding:14, marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontWeight:700, fontSize:13 }}>{fmtCur(entry.payload.items?.reduce((s,i)=>s+i.unitPrice*i.quantity,0) || 0)}</span>
                    <span style={{ fontSize:11, color:'#6b7fa3' }}>{new Date(entry.queuedAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#6b7fa3', marginBottom:8 }}>
                    {entry.payload.items?.map(i => `${i.quantity}× item #${i.productId}`).join(', ')}
                  </div>
                  <div style={{ background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:7,
                    padding:'8px 10px', fontSize:11.5, color:'#c04040', marginBottom:10 }}>
                    ⚠️ {entry.lastError}
                  </div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button onClick={() => handleDiscardFailed(entry.offlineId)}
                      style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0',
                        background:'white', color:'#6b7fa3', fontSize:11.5, fontWeight:600, cursor:'pointer' }}>
                      Discard
                    </button>
                    <button onClick={() => handleRetryFailed(entry.offlineId)}
                      style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #1e6bbd',
                        background:'none', color:'#1e6bbd', fontSize:11.5, fontWeight:600, cursor:'pointer' }}>
                      Retry Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
