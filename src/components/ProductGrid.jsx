// ============================================================
//  pos-client/src/components/ProductGrid.jsx
//  Visual product grid with variant picker
// ============================================================
import { useState } from 'react';

function VariantPicker({ product, onSelect, onClose }) {
  const [selected, setSelected] = useState({
    size: '', color: '' });

  const sizes  = [...new Set(
    product.variants.map(v => v.size).filter(Boolean))];
  const colors = [...new Set(
    product.variants.map(v => v.color).filter(Boolean))];

  const matching = product.variants.find(v =>
    (!selected.size  || v.size  === selected.size) &&
    (!selected.color || v.color === selected.color)
  );

  return (
    <div style={{ position:'fixed', inset:0,
      background:'rgba(13,27,42,.6)',
      display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:9999, padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'white', borderRadius:20,
        padding:28, width:'100%', maxWidth:400,
        boxShadow:'0 20px 60px rgba(0,0,0,.4)' }}>

        <div style={{ display:'flex',
          justifyContent:'space-between',
          alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>
              {product.name}
            </div>
            <div style={{ fontSize:12, color:'#6b7fa3' }}>
              Select variant
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none',
              fontSize:24, cursor:'pointer',
              color:'#6b7fa3' }}>×</button>
        </div>

        {sizes.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:600,
              color:'#6b7fa3', marginBottom:8,
              textTransform:'uppercase', letterSpacing:.5 }}>
              Size
            </div>
            <div style={{ display:'flex',
              flexWrap:'wrap', gap:8 }}>
              {sizes.map(sz => (
                <button key={sz}
                  onClick={() =>
                    setSelected(p => ({...p, size:sz}))}
                  style={{ padding:'8px 16px',
                    borderRadius:10, border:'2px solid',
                    borderColor: selected.size===sz
                      ? '#1e6bbd' : '#e2e8f0',
                    background: selected.size===sz
                      ? '#1e6bbd' : 'white',
                    color: selected.size===sz
                      ? 'white' : '#1a2740',
                    fontWeight:600, fontSize:14,
                    cursor:'pointer' }}>
                  {sz}
                </button>
              ))}
            </div>
          </div>
        )}

        {colors.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:600,
              color:'#6b7fa3', marginBottom:8,
              textTransform:'uppercase', letterSpacing:.5 }}>
              Color
            </div>
            <div style={{ display:'flex',
              flexWrap:'wrap', gap:8 }}>
              {colors.map(cl => (
                <button key={cl}
                  onClick={() =>
                    setSelected(p => ({...p, color:cl}))}
                  style={{ padding:'8px 16px',
                    borderRadius:10, border:'2px solid',
                    borderColor: selected.color===cl
                      ? '#1e6bbd' : '#e2e8f0',
                    background: selected.color===cl
                      ? '#1e6bbd' : 'white',
                    color: selected.color===cl
                      ? 'white' : '#1a2740',
                    fontWeight:600, fontSize:14,
                    cursor:'pointer' }}>
                  {cl}
                </button>
              ))}
            </div>
          </div>
        )}

        {matching && (
          <div style={{ background:'#f4f6f9',
            borderRadius:10, padding:12, marginBottom:16,
            fontSize:13 }}>
            <div style={{ display:'flex',
              justifyContent:'space-between' }}>
              <span style={{ color:'#6b7fa3' }}>Price</span>
              <span style={{ fontWeight:700,
                color:'#1e6bbd' }}>
                GH₵ {parseFloat(
                  matching.retail_price
                  || matching.selling_price || 0
                ).toFixed(2)}
              </span>
            </div>
            <div style={{ display:'flex',
              justifyContent:'space-between',
              marginTop:4 }}>
              <span style={{ color:'#6b7fa3' }}>Stock</span>
              <span style={{ fontWeight:600,
                color: parseFloat(
                  matching.quantity_on_hand) > 0
                  ? '#16c79a' : '#e05c5c' }}>
                {matching.quantity_on_hand}{' '}
                {parseFloat(matching.quantity_on_hand) > 0
                  ? 'available' : '— Out of stock'}
              </span>
            </div>
          </div>
        )}

        <button
          disabled={!matching}
          onClick={() => {
            if (matching) { onSelect(matching); onClose(); }
          }}
          style={{ width:'100%', padding:14,
            background: matching ? '#1e6bbd' : '#e2e8f0',
            color: matching ? 'white' : '#6b7fa3',
            border:'none', borderRadius:12,
            fontSize:15, fontWeight:700,
            cursor: matching ? 'pointer' : 'not-allowed',
            fontFamily:'sans-serif' }}>
          {matching ? 'Add to Cart' : 'Select options above'}
        </button>
      </div>
    </div>
  );
}

// apiBase points at the /api/v1 base used for fetch() calls;
// static /uploads files are served from the API root, so strip
// the /api/v1 suffix back off for building image URLs.
const filesBase = (apiBase) =>
  (apiBase || '').replace(/\/api\/v\d+\/?$/, '');

export default function ProductGrid({ products, loading, onAddToCart, apiBase, token }) {
  const [variantProduct, setVariantProduct] = useState(null);

  const handleProductTap = (product) => {
    if (product.has_variants && product.variants?.length > 0) {
      setVariantProduct(product);
    } else {
      onAddToCart(product, null);
    }
  };

  if (loading) return (
    <div style={{ flex:1, display:'flex',
      alignItems:'center', justifyContent:'center',
      color:'#6b7fa3', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40,
        border:'4px solid #e2e8f0',
        borderTopColor:'#1e6bbd', borderRadius:'50%',
        animation:'spin .7s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading products...
    </div>
  );

  if (products.length === 0) return (
    <div style={{ flex:1, display:'flex',
      alignItems:'center', justifyContent:'center',
      color:'#6b7fa3', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:48 }}>📦</div>
      <div style={{ fontSize:15, fontWeight:600,
        color:'#1a2740' }}>No products found</div>
      <div style={{ fontSize:13 }}>
        Try a different search or category
      </div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:'auto',
      padding:16 }}>
      <div style={{ display:'grid',
        gridTemplateColumns:
          'repeat(auto-fill, minmax(150px, 1fr))',
        gap:12 }}>
        {products.map(product => {
          const price = parseFloat(
            product.retail_price
            || product.selling_price || 0);
          const stock  = parseFloat(product.stock || 0);
          const isLow  = product.reorder_level &&
            stock <= parseFloat(product.reorder_level);
          const isOut  = stock <= 0 &&
            product.product_type === 'inventory';

          return (
            <div key={product.id}
              onClick={() => !isOut && handleProductTap(product)}
              style={{ background:'white',
                borderRadius:14, overflow:'hidden',
                boxShadow:'0 2px 8px rgba(13,27,42,.08)',
                cursor: isOut ? 'not-allowed' : 'pointer',
                opacity: isOut ? .6 : 1,
                transition:'transform .15s, box-shadow .15s',
                userSelect:'none',
                border:'1px solid #e2e8f0' }}
              onMouseDown={e => {
                if (!isOut) e.currentTarget.style.transform =
                  'scale(.97)';
              }}
              onMouseUp={e => {
                e.currentTarget.style.transform = 'scale(1)';
              }}>

              {/* Product image */}
              <div style={{ height:120,
                background: product.image_url
                  ? `url(${filesBase(apiBase)}${product.image_url}?token=${token}) center/cover`
                  : 'linear-gradient(135deg,#e8f4fd,#d1e9f9)',
                display:'flex', alignItems:'center',
                justifyContent:'center', position:'relative' }}>
                {!product.image_url && (
                  <div style={{ fontSize:36 }}>📦</div>
                )}
                {isOut && (
                  <div style={{ position:'absolute',
                    inset:0, background:'rgba(0,0,0,.5)',
                    display:'flex', alignItems:'center',
                    justifyContent:'center',
                    color:'white', fontWeight:700,
                    fontSize:12 }}>
                    OUT OF STOCK
                  </div>
                )}
                {isLow && !isOut && (
                  <div style={{ position:'absolute',
                    top:6, right:6,
                    background:'#e8a04a',
                    color:'white', borderRadius:20,
                    padding:'2px 8px', fontSize:10,
                    fontWeight:700 }}>
                    LOW
                  </div>
                )}
                {product.has_variants && (
                  <div style={{ position:'absolute',
                    top:6, left:6,
                    background:'#7c3aed',
                    color:'white', borderRadius:20,
                    padding:'2px 8px', fontSize:10,
                    fontWeight:700 }}>
                    VARIANTS
                  </div>
                )}
              </div>

              {/* Product info */}
              <div style={{ padding:'10px 12px' }}>
                <div style={{ fontWeight:600, fontSize:13,
                  marginBottom:4, lineHeight:1.3,
                  overflow:'hidden',
                  display:'-webkit-box',
                  WebkitLineClamp:2,
                  WebkitBoxOrient:'vertical' }}>
                  {product.name}
                </div>
                <div style={{ fontFamily:'monospace',
                  fontWeight:800, fontSize:15,
                  color:'#1e6bbd' }}>
                  GH₵ {price.toFixed(2)}
                </div>
                {product.product_type === 'inventory' && (
                  <div style={{ fontSize:10, marginTop:3,
                    color: isOut ? '#e05c5c'
                      : isLow ? '#e8a04a' : '#16c79a',
                    fontWeight:600 }}>
                    {isOut ? 'Out of stock'
                      : `${stock} in stock`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {variantProduct && (
        <VariantPicker
          product={variantProduct}
          onSelect={(variant) =>
            onAddToCart(variantProduct, variant)}
          onClose={() => setVariantProduct(null)}/>
      )}
    </div>
  );
}
