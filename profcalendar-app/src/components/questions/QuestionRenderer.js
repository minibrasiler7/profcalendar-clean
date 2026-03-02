import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import colors from '../../theme/colors';

const BASE_URL = 'https://profcalendar-clean.onrender.com';
const SCREEN_WIDTH = Dimensions.get('window').width;

// ============================================================
// MathText — renders text with LaTeX using a WebView when needed
// ============================================================
function MathText({ text, style, inline }) {
  if (!text) return null;
  // Flatten style array if needed
  const flatStyle = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style || {});
  // Check if text contains math delimiters
  const hasMath = /\$\$.*?\$\$|\$.*?\$|\\[(\[].*?\\[)\]]/s.test(text);
  if (!hasMath) {
    return <Text style={flatStyle}>{text}</Text>;
  }
  // Render with KaTeX in a WebView
  const fontSize = flatStyle.fontSize || 14;
  const color = flatStyle.color || '#374151';
  const fontWeight = flatStyle.fontWeight || '400';
  const htmlContent = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;font-size:${fontSize}px;color:${color};font-weight:${fontWeight};line-height:1.4;padding:2px 0;background:transparent;white-space:nowrap}
.katex{font-size:1.1em}</style>
</head><body><span id="content"></span>
<script>document.getElementById('content').textContent=${JSON.stringify(text)};
renderMathInElement(document.getElementById('content'),{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}],throwOnError:false});
// Send size to React Native
setTimeout(()=>{const r=document.getElementById('content').getBoundingClientRect();window.ReactNativeWebView.postMessage(JSON.stringify({h:Math.ceil(r.height)+10,w:Math.ceil(r.width)+10}))},300);
</script></body></html>`;

  const [height, setHeight] = useState(24);
  const [width, setWidth] = useState(null);
  const wrapStyle = flatStyle.flex ? { flex: flatStyle.flex, height } : { height, ...(width ? { width } : {}) };
  return (
    <View style={wrapStyle}>
      <WebView
        source={{ html: htmlContent }}
        style={{ height, width: '100%', backgroundColor: 'transparent' }}
        scrollEnabled={false}
        onMessage={(e) => {
          try { const d = JSON.parse(e.nativeEvent.data); if (d.h) setHeight(d.h); if (d.w) setWidth(d.w); } catch(err) {}
        }}
        originWhitelist={['*']}
        javaScriptEnabled={true}
      />
    </View>
  );
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// Drag & Drop Sorting — ORDER mode (tap-to-select, tap-to-place)
// ============================================================
function DraggableOrderList({ items, order, onReorder, disabled }) {
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const handleTap = (pos) => {
    if (disabled) return;
    console.log(`[DragOrder] tap at position ${pos}, selectedIdx=${selectedIdx}`);
    if (selectedIdx === -1) {
      // First tap: select this item
      setSelectedIdx(pos);
      console.log(`[DragOrder] selected item at position ${pos}`);
    } else if (selectedIdx === pos) {
      // Tap same item: deselect
      setSelectedIdx(-1);
      console.log(`[DragOrder] deselected item at position ${pos}`);
    } else {
      // Second tap: move selected item to this position
      const newOrder = [...order];
      const moved = newOrder.splice(selectedIdx, 1)[0];
      newOrder.splice(pos, 0, moved);
      console.log(`[DragOrder] moved item from position ${selectedIdx} to ${pos}, new order=${newOrder}`);
      onReorder(newOrder);
      setSelectedIdx(-1);
    }
  };

  return (
    <View style={dndStyles.container}>
      <Text style={dndStyles.hint}>
        Touche un élément pour le sélectionner, puis touche sa destination
      </Text>
      {order.map((origIdx, pos) => {
        const isSelected = selectedIdx === pos;
        const isTarget = selectedIdx >= 0 && selectedIdx !== pos;
        return (
          <TouchableOpacity
            key={`${origIdx}-${pos}`}
            style={[
              dndStyles.item,
              { height: 56, marginBottom: 6 },
              isSelected && dndStyles.itemSelected,
              isTarget && dndStyles.itemTarget,
            ]}
            onPress={() => handleTap(pos)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <View style={[dndStyles.grip, isSelected && dndStyles.gripSelected]}>
              <Ionicons name="reorder-three" size={22} color={isSelected ? '#FFF' : '#9ca3af'} />
            </View>
            <Text style={dndStyles.num}>{pos + 1}.</Text>
            <MathText text={items[origIdx]} style={[dndStyles.text, isSelected && dndStyles.textSelected]} />
            {isSelected && (
              <View style={dndStyles.selectedBadge}>
                <Ionicons name="checkmark" size={14} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ============================================================
// Drag & Drop Sorting — CATEGORIES mode (tap to pick, tap to place)
// ============================================================
function DraggableCategoryList({ items, categories, catAssignments, onUpdate, disabled }) {
  const [pickedItem, setPickedItem] = useState(null);
  // Shuffle unassigned items in the pool for display
  const [poolItemOrder, setPoolItemOrder] = useState(() => {
    const assignedItems = new Set(Object.values(catAssignments).flat());
    const unassignedIndices = items
      .map((_, idx) => idx)
      .filter(idx => items[idx] && !assignedItems.has(idx));
    return shuffleArray(unassignedIndices);
  });

  const pickFromPool = (itemIdx) => {
    if (disabled) return;
    if (pickedItem?.itemIdx === itemIdx && pickedItem?.fromCat === null) {
      setPickedItem(null);
    } else {
      setPickedItem({ itemIdx, fromCat: null });
    }
  };

  const pickFromCategory = (itemIdx, catIdx) => {
    if (disabled) return;
    if (pickedItem?.itemIdx === itemIdx && pickedItem?.fromCat === catIdx) {
      setPickedItem(null);
    } else {
      setPickedItem({ itemIdx, fromCat: catIdx });
    }
  };

  const dropInCategory = (catIdx) => {
    if (!pickedItem || disabled) return;
    const newCats = {};
    Object.keys(catAssignments).forEach(k => {
      newCats[k] = [...(catAssignments[k] || [])];
    });
    if (pickedItem.fromCat !== null) {
      newCats[pickedItem.fromCat] = (newCats[pickedItem.fromCat] || []).filter(x => x !== pickedItem.itemIdx);
    }
    if (!newCats[catIdx]) newCats[catIdx] = [];
    if (!newCats[catIdx].includes(pickedItem.itemIdx)) {
      newCats[catIdx].push(pickedItem.itemIdx);
    }
    onUpdate(newCats);
    setPickedItem(null);
  };

  const dropBackToPool = () => {
    if (!pickedItem || pickedItem.fromCat === null || disabled) return;
    const newCats = {};
    Object.keys(catAssignments).forEach(k => {
      newCats[k] = [...(catAssignments[k] || [])];
    });
    newCats[pickedItem.fromCat] = (newCats[pickedItem.fromCat] || []).filter(x => x !== pickedItem.itemIdx);
    onUpdate(newCats);
    setPickedItem(null);
  };

  const assignedItems = new Set(Object.values(catAssignments).flat());

  return (
    <View style={dndStyles.container}>
      <Text style={dndStyles.hint}>
        {pickedItem ? "Touche une catégorie pour placer l'élément" : 'Touche un élément pour le sélectionner'}
      </Text>

      {categories.map((cat, catIdx) => {
        const catItems = catAssignments[catIdx] || [];
        const isTarget = pickedItem && (pickedItem.fromCat === null || pickedItem.fromCat !== catIdx);
        return (
          <TouchableOpacity
            key={catIdx}
            style={[dndStyles.catZone, isTarget && dndStyles.catZoneTarget]}
            onPress={() => pickedItem ? dropInCategory(catIdx) : null}
            activeOpacity={pickedItem ? 0.7 : 1}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="folder-open" size={14} color="#4b5563" />
              <MathText text={cat.name} style={dndStyles.catName} />
            </View>
            <View style={dndStyles.catItems}>
              {catItems.map(itemIdx => (
                <TouchableOpacity
                  key={itemIdx}
                  style={[
                    dndStyles.catItem,
                    pickedItem?.itemIdx === itemIdx && dndStyles.catItemPicked,
                  ]}
                  onPress={() => pickFromCategory(itemIdx, catIdx)}
                  disabled={disabled}
                >
                  <MathText text={items[itemIdx]} style={dndStyles.catItemText} />
                  <Ionicons name="close-circle" size={14} color="#ef4444" />
                </TouchableOpacity>
              ))}
              {catItems.length === 0 && (
                <Text style={dndStyles.catEmpty}>Déposer ici</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[dndStyles.pool, pickedItem?.fromCat !== null && pickedItem?.fromCat !== undefined && dndStyles.poolTarget]}
        onPress={pickedItem?.fromCat !== null && pickedItem?.fromCat !== undefined ? dropBackToPool : undefined}
        activeOpacity={pickedItem?.fromCat !== null ? 0.7 : 1}
      >
        <Text style={dndStyles.poolLabel}>
          <Ionicons name="hand-left" size={14} color="#6b7280" /> Éléments à classer :
        </Text>
        <View style={dndStyles.poolItems}>
          {poolItemOrder.map((itemIdx) => {
            const item = items[itemIdx];
            if (!item || assignedItems.has(itemIdx)) return null;
            return (
              <TouchableOpacity
                key={itemIdx}
                style={[
                  dndStyles.poolItem,
                  pickedItem?.itemIdx === itemIdx && pickedItem?.fromCat === null && dndStyles.poolItemPicked,
                ]}
                onPress={() => pickFromPool(itemIdx)}
                disabled={disabled}
              >
                <Ionicons name="reorder-three" size={18} color="#9ca3af" />
                <MathText text={item} style={dndStyles.poolItemText} />
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// Image Interactive — touch to select zones
// ============================================================
function ImageInteractive({ imageUrl, zones, clicks, onClicksChange, disabled, correctZones }) {
  const [imgLayout, setImgLayout] = useState(null);
  const [imgNatural, setImgNatural] = useState(null);

  console.log(`[ImageInteractive] RENDER: url=${imageUrl}, imgNatural=${JSON.stringify(imgNatural)}, imgLayout=${JSON.stringify(imgLayout)}, clicks=${clicks.length}, correctZones=${correctZones ? correctZones.length : 'null'}, disabled=${disabled}`);

  // Use both Image.getSize AND onLoad for maximum reliability
  useEffect(() => {
    if (imageUrl) {
      console.log(`[ImageInteractive] Calling Image.getSize for: ${imageUrl}`);
      Image.getSize(
        imageUrl,
        (w, h) => {
          console.log(`[ImageInteractive] Image.getSize SUCCESS: ${w}x${h}`);
          setImgNatural({ w, h });
        },
        (err) => {
          console.log(`[ImageInteractive] Image.getSize FAILED: ${err}`);
        }
      );
    }
  }, [imageUrl]);

  const onImageLoad = (e) => {
    // Fallback: get natural dimensions from the onLoad event
    const source = e.nativeEvent?.source;
    if (source && source.width && source.height) {
      console.log(`[ImageInteractive] onLoad source: ${source.width}x${source.height}`);
      if (!imgNatural) {
        console.log(`[ImageInteractive] Setting imgNatural from onLoad (getSize hadn't resolved)`);
        setImgNatural({ w: source.width, h: source.height });
      }
    } else {
      console.log(`[ImageInteractive] onLoad fired but no source dimensions: ${JSON.stringify(e.nativeEvent)}`);
    }
  };

  const onImageError = (e) => {
    console.log(`[ImageInteractive] Image LOAD ERROR: ${JSON.stringify(e.nativeEvent)}`);
  };

  const handleTouch = (evt) => {
    if (disabled) { console.log('[ImageInteractive] Touch ignored: disabled'); return; }
    if (!imgLayout) { console.log('[ImageInteractive] Touch ignored: no imgLayout'); return; }
    if (!imgNatural) { console.log('[ImageInteractive] Touch ignored: no imgNatural'); return; }
    const { locationX, locationY } = evt.nativeEvent;
    const scaleX = imgNatural.w / imgLayout.width;
    const scaleY = imgNatural.h / imgLayout.height;
    const x = Math.round(locationX * scaleX);
    const y = Math.round(locationY * scaleY);

    console.log(`[ImageInteractive] Touch: display=(${locationX.toFixed(1)}, ${locationY.toFixed(1)}), natural=(${x}, ${y}), scale=(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`);
    console.log(`[ImageInteractive] Zones config:`, JSON.stringify(zones));

    const expected = zones.length || 1;
    let newClicks = [...clicks];
    if (newClicks.length >= expected) {
      newClicks = [];
    }
    newClicks.push({ x, y });
    onClicksChange(newClicks);
  };

  const imgWidth = SCREEN_WIDTH - 32;
  const imgHeight = imgNatural ? (imgWidth / imgNatural.w) * imgNatural.h : 300;

  const onImgLayout = (e) => {
    const layout = e.nativeEvent.layout;
    console.log(`[ImageInteractive] onLayout: width=${layout.width}, height=${layout.height}`);
    setImgLayout(layout);
  };

  // Render correct zone overlays after feedback
  const renderOverlays = () => {
    const overlays = [];
    const hasNatural = !!imgNatural;
    const hasLayout = !!imgLayout;

    // Render correct zones (green circles) when feedback shown
    if (correctZones && correctZones.length > 0) {
      console.log(`[ImageInteractive] renderOverlays: ${correctZones.length} correct zones, hasLayout=${hasLayout}, hasNatural=${hasNatural}`);
      console.log(`[ImageInteractive] correctZones data:`, JSON.stringify(correctZones));

      if (hasLayout && hasNatural) {
        correctZones.forEach((zone, zIdx) => {
          let zonePoints = zone.points || [];
          const zoneLabel = zone.label || '';
          const radius = zone.radius || 50;

          // Backward compatibility: old format with x/y directly on zone
          if (zonePoints.length === 0 && (zone.x != null || zone.y != null)) {
            zonePoints = [{ x: zone.x || 0, y: zone.y || 0 }];
          }

          console.log(`[ImageInteractive] Zone ${zIdx} "${zoneLabel}": ${zonePoints.length} points, radius=${radius}, raw=${JSON.stringify(zone)}`);

          zonePoints.forEach((pt, pIdx) => {
            const ptX = typeof pt.x === 'number' ? pt.x : parseFloat(pt.x) || 0;
            const ptY = typeof pt.y === 'number' ? pt.y : parseFloat(pt.y) || 0;
            const dispX = (ptX / imgNatural.w) * imgLayout.width;
            const dispY = (ptY / imgNatural.h) * imgLayout.height;
            const dispRadius = Math.max((radius / Math.max(imgNatural.w, imgNatural.h)) * Math.max(imgLayout.width, imgLayout.height), 25);

            console.log(`[ImageInteractive] Zone ${zIdx} pt ${pIdx}: natural=(${ptX},${ptY}) -> display=(${dispX.toFixed(1)},${dispY.toFixed(1)}), dispR=${dispRadius.toFixed(1)}`);

            overlays.push(
              <View key={`cz-${zIdx}-${pIdx}`} style={{
                position: 'absolute',
                left: dispX - dispRadius,
                top: dispY - dispRadius,
                width: dispRadius * 2,
                height: dispRadius * 2,
                borderWidth: 4,
                borderColor: '#10b981',
                borderRadius: dispRadius,
                backgroundColor: 'rgba(16, 185, 129, 0.3)',
                zIndex: 100,
              }} />
            );
            if (pIdx === 0 && zoneLabel) {
              overlays.push(
                <View key={`cl-${zIdx}`} style={{
                  position: 'absolute',
                  left: Math.max(0, dispX - 40),
                  top: dispY + dispRadius + 4,
                  backgroundColor: '#10b981',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  zIndex: 101,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>{zoneLabel}</Text>
                </View>
              );
            }
          });
        });
      } else {
        console.log(`[ImageInteractive] CAN'T render zones: imgLayout=${JSON.stringify(imgLayout)}, imgNatural=${JSON.stringify(imgNatural)}`);
        // Fallback: show a text message that zones exist but we can't position them
        overlays.push(
          <View key="fallback-msg" style={{ position: 'absolute', top: 10, left: 10, right: 10, backgroundColor: 'rgba(16,185,129,0.9)', borderRadius: 8, padding: 8, zIndex: 200 }}>
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
              {correctZones.length} zone(s) correcte(s) - voir le détail ci-dessous
            </Text>
          </View>
        );
      }
    }

    // Render user click markers (red dots)
    if (hasLayout && hasNatural) {
      clicks.forEach((click, i) => {
        const dispX = (click.x / imgNatural.w) * imgLayout.width;
        const dispY = (click.y / imgNatural.h) * imgLayout.height;
        overlays.push(
          <View key={`mk-${i}`} style={[imgStyles.marker, { left: dispX - 14, top: dispY - 14, zIndex: 150 }]}>
            <Text style={imgStyles.markerLabel}>{zones[i]?.label || (i + 1)}</Text>
          </View>
        );
      });
    }

    return overlays;
  };

  return (
    <View>
      <Text style={imgStyles.hint}>
        Touche l'image pour identifier : {zones.map(z => z.label).join(', ')}
      </Text>
      <Text style={imgStyles.subHint}>
        {clicks.length}/{zones.length} zone(s) placée(s)
      </Text>
      <View
        style={[imgStyles.container, { width: imgWidth, height: imgHeight, overflow: 'visible' }]}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleTouch}
      >
        <Image
          source={{ uri: imageUrl }}
          style={{ width: imgWidth, height: imgHeight }}
          resizeMode="contain"
          onLayout={onImgLayout}
          onLoad={onImageLoad}
          onError={onImageError}
        />
        {renderOverlays()}
      </View>
      {correctZones && correctZones.length > 0 && (
        <View style={{ marginTop: 8, padding: 10, backgroundColor: '#ecfdf5', borderRadius: 10, borderWidth: 2, borderColor: '#10b981' }}>
          <Text style={{ fontSize: 13, color: '#065f46', fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
            Zones correctes :
          </Text>
          {correctZones.map((z, i) => (
            <Text key={i} style={{ fontSize: 12, color: '#047857', textAlign: 'center' }}>
              {z.label || `Zone ${i + 1}`} : ({(z.points || [{ x: z.x, y: z.y }]).map(p => `${p.x}, ${p.y}`).join(' | ')})
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================
// Graph Interactive — WebView with canvas
// ============================================================
function GraphInteractive({ config, onPointsChange, disabled }) {
  const webviewRef = useRef(null);
  const [staticImage, setStaticImage] = useState(null);

  const graphHtml = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fafbfc;display:flex;align-items:center;justify-content:center;height:100vh;${config.static_mode ? '' : 'touch-action:none;'}overflow:hidden}canvas{display:block}</style>
</head><body>
<canvas id="g"></canvas>
<script>
const c=${JSON.stringify(config)};const cv=document.getElementById('g');const x=cv.getContext('2d');
const W=window.innerWidth,H=window.innerHeight,M=44,d=window.devicePixelRatio||2;
cv.width=W*d;cv.height=H*d;cv.style.width=W+'px';cv.style.height=H+'px';x.scale(d,d);
const isQ=c.question_type==='draw_quadratic',nP=isQ?3:2;
const xMin=c.x_min,xMax=c.x_max,yMin=c.y_min,yMax=c.y_max;
const xR=xMax-xMin,pts=[];
for(let i=0;i<nP;i++)pts.push({x:Math.round(xMin+xR*(i+1)/(nP+1)),y:0});
let dr=-1;
function g2p(gx,gy){const gw=W-2*M,gh=H-2*M;return{px:M+((gx-xMin)/(xMax-xMin))*gw,py:H-M-((gy-yMin)/(yMax-yMin))*gh}}
function p2g(px,py){const gw=W-2*M,gh=H-2*M;return{x:xMin+((px-M)/gw)*(xMax-xMin),y:yMin+((H-M-py)/gh)*(yMax-yMin)}}
function draw(){x.clearRect(0,0,W,H);x.fillStyle='#fafbfc';x.fillRect(0,0,W,H);
x.strokeStyle='#e5e7eb';x.lineWidth=1;
for(let i=Math.ceil(xMin);i<=xMax;i++){const p=g2p(i,0);x.beginPath();x.moveTo(p.px,M);x.lineTo(p.px,H-M);x.stroke()}
for(let i=Math.ceil(yMin);i<=yMax;i++){const p=g2p(0,i);x.beginPath();x.moveTo(M,p.py);x.lineTo(W-M,p.py);x.stroke()}
const o=g2p(0,0);x.strokeStyle='#1f2937';x.lineWidth=2.5;
x.beginPath();x.moveTo(M,Math.max(M,Math.min(H-M,o.py)));x.lineTo(W-M,Math.max(M,Math.min(H-M,o.py)));x.stroke();
x.beginPath();x.moveTo(Math.max(M,Math.min(W-M,o.px)),M);x.lineTo(Math.max(M,Math.min(W-M,o.px)),H-M);x.stroke();
x.fillStyle='#374151';x.font='bold 14px sans-serif';
x.fillText(c.x_label||'x',W-M+6,Math.max(M,Math.min(H-M,o.py))+5);
x.fillText(c.y_label||'y',Math.max(M,Math.min(W-M,o.px))+6,M-10);
x.font='13px sans-serif';x.fillStyle='#6b7280';
for(let i=Math.ceil(xMin);i<=xMax;i++){if(i===0)continue;const p=g2p(i,0);x.textAlign='center';x.fillText(i,p.px,Math.min(H-M+16,o.py+16))}
x.textAlign='right';for(let i=Math.ceil(yMin);i<=yMax;i++){if(i===0)continue;const p=g2p(0,i);x.fillText(i,Math.max(M-4,o.px-6),p.py+4)}x.textAlign='left';
let fn=null;if(isQ&&pts.length>=3){const[a,b,e]=pts;const dt=(a.x**2*(b.x-e.x)-b.x**2*(a.x-e.x)+e.x**2*(a.x-b.x));if(Math.abs(dt)>0.001){const ca=(a.y*(b.x-e.x)-b.y*(a.x-e.x)+e.y*(a.x-b.x))/dt;const cb=(a.x**2*(b.y-e.y)-b.x**2*(a.y-e.y)+e.x**2*(a.y-b.y))/dt;const cc=(a.x**2*(b.x*e.y-e.x*b.y)-b.x**2*(a.x*e.y-e.x*a.y)+e.x**2*(a.x*b.y-b.x*a.y))/dt;fn=v=>ca*v*v+cb*v+cc}}
else if(pts.length>=2){const dx=pts[1].x-pts[0].x;if(Math.abs(dx)>0.001){const a=(pts[1].y-pts[0].y)/dx;const b=pts[0].y-a*pts[0].x;fn=v=>a*v+b}}
if(fn&&!c.static_mode){x.strokeStyle='#667eea';x.lineWidth=3;x.lineCap='round';x.beginPath();let s=false;const st=(xMax-xMin)/400;for(let i=xMin;i<=xMax;i+=st){const y=fn(i);const p=g2p(i,y);if(p.py<M-5||p.py>H-M+5){s=false;continue}if(!s){x.moveTo(p.px,p.py);s=true}else x.lineTo(p.px,p.py)}x.stroke()}
if(c.static_mode&&c.correct_answer){let sfn=null;const ca=c.correct_answer;if(c.question_type==='draw_quadratic'){sfn=v=>(ca.a||0)*v*v+(ca.b||0)*v+(ca.c||0)}else{sfn=v=>(ca.a||0)*v+(ca.b||0)}if(sfn){x.strokeStyle='#667eea';x.lineWidth=3;x.lineCap='round';x.beginPath();let s=false;const st=(xMax-xMin)/400;for(let i=xMin;i<=xMax;i+=st){const y=sfn(i);const p=g2p(i,y);if(p.py<M-5||p.py>H-M+5){s=false;continue}if(!s){x.moveTo(p.px,p.py);s=true}else x.lineTo(p.px,p.py)}x.stroke()}}
if(!c.static_mode){pts.forEach((pt,i)=>{const p=g2p(pt.x,pt.y);if(p.px<M-5||p.px>W-M+5||p.py<M-5||p.py>H-M+5)return;x.fillStyle=(i===dr)?'rgba(220,38,38,0.2)':'rgba(16,185,129,0.2)';x.beginPath();x.arc(p.px,p.py,22,0,Math.PI*2);x.fill();x.fillStyle=i===dr?'#dc2626':'#10b981';x.strokeStyle='white';x.lineWidth=3;x.beginPath();x.arc(p.px,p.py,14,0,Math.PI*2);x.fill();x.stroke();x.fillStyle='white';x.font='bold 13px sans-serif';x.textAlign='center';x.fillText(String.fromCharCode(65+i),p.px,p.py+5);x.textAlign='left';x.fillStyle='#1e1b4b';x.font='bold 13px sans-serif';x.fillText('('+pt.x+', '+pt.y+')',p.px+20,p.py-8)})}}
function gXY(e){const r=cv.getBoundingClientRect();const sx=W/r.width,sy=H/r.height;const t=e.touches?e.touches[0]:e;return{px:(t.clientX-r.left)*sx,py:(t.clientY-r.top)*sy}}
function sp(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'points',points:pts.map(p=>({x:p.x,y:p.y}))}))}
if(!c.static_mode){
cv.addEventListener('touchstart',e=>{e.preventDefault();const{px,py}=gXY(e);for(let i=0;i<pts.length;i++){const p=g2p(pts[i].x,pts[i].y);if(Math.sqrt((px-p.px)**2+(py-p.py)**2)<40){dr=i;break}}},{passive:false});
cv.addEventListener('touchmove',e=>{e.preventDefault();if(dr<0)return;const{px,py}=gXY(e);const g=p2g(px,py);pts[dr].x=Math.round(g.x);pts[dr].y=Math.round(g.y);draw()},{passive:false});
cv.addEventListener('touchend',e=>{dr=-1;draw();sp()});
}
draw();sp();
if(c.static_mode){setTimeout(()=>{const dataUrl=cv.toDataURL('image/png');window.ReactNativeWebView.postMessage(JSON.stringify({type:'snapshot',uri:dataUrl}))},400);}
</script></body></html>`;

  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'points') {
        // Don't update answer when disabled (locked after check-block)
        // to prevent WebView reload from overwriting the correct answer
        if (!disabledRef.current) {
          onPointsChange(data.points);
        }
      } else if (data.type === 'snapshot' && data.uri) {
        setStaticImage(data.uri);
      }
    } catch (e) {}
  };

  return (
    <View style={graphStyles.container}>
      {!config.static_mode && (
        <Text style={graphStyles.hint}>
          {config.question_type === 'draw_quadratic'
            ? 'Déplace les 3 points pour tracer la courbe.'
            : 'Déplace les 2 points pour tracer la droite.'}
        </Text>
      )}
      {config.question ? <MathText text={config.question} style={graphStyles.question} /> : null}
      <View style={[graphStyles.webviewWrap, disabled && { pointerEvents: 'none' }]}>
        {config.static_mode && staticImage ? (
          <Image source={{ uri: staticImage }} style={graphStyles.webview} resizeMode="contain" />
        ) : (
          <WebView
            ref={webviewRef}
            source={{ html: graphHtml }}
            style={[graphStyles.webview, config.static_mode && staticImage ? { position: 'absolute', opacity: 0 } : null]}
            scrollEnabled={false}
            bounces={false}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            originWhitelist={['*']}
          />
        )}
      </View>
    </View>
  );
}

// ============================================================
// ImageLabelsMode — image with text input labels overlay
// ============================================================
function ImageLabelsMode({ imageUrl, labels, userLabels, onUpdate, isLocked }) {
  const [imgSize, setImgSize] = useState({ width: SCREEN_WIDTH - 40, height: 200 });

  useEffect(() => {
    if (imageUrl) {
      Image.getSize(imageUrl, (natW, natH) => {
        const displayW = SCREEN_WIDTH - 40;
        const displayH = displayW * (natH / natW);
        setImgSize({ width: displayW, height: displayH });
      }, () => {});
    }
  }, [imageUrl]);

  return (
    <View>
      <Text style={{ color: colors.textLight, marginBottom: 8, fontSize: 14 }}>
        Complète les labels sur l'image :
      </Text>
      <View style={{ position: 'relative', width: imgSize.width, height: imgSize.height }}>
        <Image source={{ uri: imageUrl }} style={{ width: imgSize.width, height: imgSize.height, borderRadius: 8 }} resizeMode="contain" />
        {labels.map((lbl, i) => (
          <TextInput
            key={i}
            style={{
              position: 'absolute',
              left: `${lbl.x}%`,
              top: `${lbl.y}%`,
              transform: [{ translateX: -40 }, { translateY: -16 }],
              backgroundColor: 'rgba(255,255,255,0.75)',
              borderWidth: 2,
              borderColor: '#667eea',
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 3,
              fontSize: 13,
              textAlign: 'center',
              minWidth: 80,
              maxWidth: 120,
            }}
            placeholder={lbl.hint || '...'}
            placeholderTextColor={colors.textLight}
            value={userLabels[String(i)] || ''}
            onChangeText={(t) => {
              const nl = { ...userLabels, [String(i)]: t };
              onUpdate(nl);
            }}
            editable={!isLocked}
          />
        ))}
      </View>
    </View>
  );
}

// ============================================================
// QuestionRenderer — main component
// ============================================================
export default function QuestionRenderer({ block, answer, onAnswerChange, isLocked, feedback }) {
  const matchingSelectedLeftRef = useRef(-1);
  const [matchingSelectedLeft, setMatchingSelectedLeft] = useState(-1);
  const matchingShuffledRef = useRef({});

  if (!block) return null;

  const c = block.config_json || {};
  const blockId = block.id;
  const blockType = block.block_type;

  const updateAnswer = (data) => {
    onAnswerChange(blockId, data);
  };

  switch (blockType) {
    case 'qcm': {
      const isMultiple = c.multiple_answers;
      const selected = answer.selected || [];
      const qcmShowResult = !!feedback;
      return (
        <View>
          {c.question ? <MathText text={c.question} style={questionStyles.questionText} /> : null}
          <View style={questionStyles.optionsContainer}>
            {(c.options || []).map((opt, i) => {
              const isSel = selected.includes(i);
              const isOptCorrect = opt.is_correct;
              const optResultStyle = qcmShowResult && isOptCorrect ? { borderColor: '#10b981', backgroundColor: '#ecfdf5' }
                : qcmShowResult && isSel && !isOptCorrect ? { borderColor: '#ef4444', backgroundColor: '#fef2f2' }
                : null;
              const showOptFeedback = qcmShowResult && opt.feedback && (isSel || isOptCorrect);
              return (
                <View key={i}>
                  <TouchableOpacity style={[questionStyles.optionButton, isSel && questionStyles.optionButtonSelected, optResultStyle]}
                    onPress={() => {
                      if (isLocked) return;
                      const newSel = isMultiple ? (isSel ? selected.filter(x => x !== i) : [...selected, i]) : [i];
                      updateAnswer({ selected: newSel });
                    }} disabled={isLocked}>
                    <View style={[questionStyles.optionRadio, isSel && questionStyles.optionRadioSelected]}>
                      {isSel && <Ionicons name="checkmark" size={12} color="#FFF" />}
                    </View>
                    <Text style={questionStyles.optionText}>{opt.text}</Text>
                  </TouchableOpacity>
                  {showOptFeedback && (
                    <View style={{
                      marginTop: -4, marginBottom: 8, marginHorizontal: 4,
                      padding: 8, borderRadius: 8,
                      backgroundColor: isOptCorrect ? '#d1fae5' : '#fee2e2',
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: isOptCorrect ? '#065f46' : '#991b1b' }}>
                        {opt.feedback}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      );
    }

    case 'short_answer':
      return (
        <View>
          {c.question ? <MathText text={c.question} style={questionStyles.questionText} /> : null}
          <TextInput style={questionStyles.textInput} placeholder="Ta réponse..." placeholderTextColor={colors.textLight}
            value={answer.value || ''} onChangeText={(t) => updateAnswer({ value: t })}
            keyboardType={c.answer_type === 'number' ? 'decimal-pad' : 'default'} editable={!isLocked} />
        </View>
      );

    case 'fill_blank': {
      const template = c.text_template || '';
      const parts = template.split(/(\{[^}]+\})/);
      let blankIdx = 0;
      const blanks = answer.blanks || [];
      const fillMode = c.mode || 'text';
      const configBlanks = c.blanks || [];

      return (
        <View><View style={questionStyles.fillBlankWrap}>
          {parts.map((part, i) => {
            if (part.match(/^\{[^}]+\}$/)) {
              const bi = blankIdx++;
              const blankConfig = configBlanks[bi] || {};
              const choices = blankConfig.choices || [];
              if (fillMode === 'choices' && choices.length > 0) {
                return (
                  <View key={i} style={questionStyles.fillBlankSelectWrap}>
                    <TouchableOpacity
                      style={[questionStyles.fillBlankSelect, blanks[bi] ? questionStyles.fillBlankSelectFilled : null]}
                      disabled={isLocked}
                      onPress={() => {
                        const options = [...choices].sort(() => Math.random() - 0.5);
                        options.unshift('— Choisir —');
                        const cancelIdx = options.length;
                        options.push('Annuler');
                        Alert.alert('Choisir un mot', null, options.map((opt, oi) => ({
                          text: opt,
                          onPress: () => {
                            if (oi === 0 || oi === cancelIdx) return;
                            const nb = [...blanks]; nb[bi] = opt; updateAnswer({ blanks: nb });
                          },
                          style: oi === cancelIdx ? 'cancel' : 'default',
                        })));
                      }}
                    >
                      <Text style={[questionStyles.fillBlankSelectText, !blanks[bi] && { color: colors.textLight }]}>
                        {blanks[bi] || '— Choisir —'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textLight} />
                    </TouchableOpacity>
                  </View>
                );
              }
              return <TextInput key={i} style={questionStyles.fillBlankInput} placeholder="..." placeholderTextColor={colors.textLight}
                value={blanks[bi] || ''} onChangeText={(t) => { const nb = [...blanks]; nb[bi] = t; updateAnswer({ blanks: nb }); }} editable={!isLocked} />;
            }
            return <Text key={i} style={questionStyles.fillBlankText}>{part}</Text>;
          })}
        </View></View>
      );
    }

    case 'matching': {
      const pairs = c.pairs || [];
      const associations = answer.associations || {};
      // Use component-level state for selectedLeft and ref for shuffled order
      if (!matchingShuffledRef.current[blockId]) {
        const items = pairs.map((p, i) => ({ text: p.right, originalIndex: i }));
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
        matchingShuffledRef.current[blockId] = items;
      }
      const shuffledRight = matchingShuffledRef.current[blockId];

      const isLeftMatched = (idx) => associations[idx] !== undefined;
      const isRightMatched = (origIdx) => Object.values(associations).includes(origIdx);

      return (
        <View>
          <Text style={{ color: colors.textLight, marginBottom: 12, fontSize: 14 }}>
            Sélectionne un élément à gauche, puis son correspondant à droite :
          </Text>
          <View style={questionStyles.matchingContainer}>
            <View style={questionStyles.matchingCol}>
              <Text style={questionStyles.matchingColTitle}>Gauche</Text>
              {pairs.map((p, i) => (
                <TouchableOpacity key={i}
                  style={[questionStyles.matchingItem,
                    matchingSelectedLeft === i && questionStyles.matchingItemSelected,
                    isLeftMatched(i) && questionStyles.matchingItemMatched]}
                  disabled={isLocked}
                  onPress={() => {
                    if (isLeftMatched(i)) {
                      // Tap on matched item => unlink it
                      const newAssoc = { ...associations };
                      delete newAssoc[i];
                      updateAnswer({ associations: newAssoc });
                      setMatchingSelectedLeft(-1);
                    } else {
                      setMatchingSelectedLeft(i);
                    }
                  }}>
                  <View style={[questionStyles.matchingNum, isLeftMatched(i) && { backgroundColor: '#10b981' }]}>
                    <Text style={questionStyles.matchingNumText}>{i + 1}</Text>
                  </View>
                  <MathText text={p.left} style={questionStyles.matchingItemText} />
                  {isLeftMatched(i) && <Ionicons name="close-circle" size={18} color="#ef4444" style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={questionStyles.matchingCol}>
              <Text style={questionStyles.matchingColTitle}>Droite</Text>
              {shuffledRight.map((item, di) => (
                <TouchableOpacity key={di}
                  style={[questionStyles.matchingItem, isRightMatched(item.originalIndex) && questionStyles.matchingItemMatched]}
                  disabled={isLocked || matchingSelectedLeft === -1}
                  onPress={() => {
                    if (matchingSelectedLeft === -1 || isRightMatched(item.originalIndex)) return;
                    const newAssoc = { ...associations, [matchingSelectedLeft]: item.originalIndex };
                    updateAnswer({ associations: newAssoc });
                    setMatchingSelectedLeft(-1);
                  }}>
                  <MathText text={item.text} style={questionStyles.matchingItemText} />
                  {isRightMatched(item.originalIndex) && (
                    <Text style={{ marginLeft: 'auto', fontSize: 11, color: '#10b981', fontWeight: '700' }}>
                      {Object.entries(associations).find(([, v]) => v === item.originalIndex)?.[0] ? (parseInt(Object.entries(associations).find(([, v]) => v === item.originalIndex)[0]) + 1) : ''} <Ionicons name="link" size={12} color="#10b981" />
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {!isLocked && Object.keys(associations).length > 0 && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}
              onPress={() => {
                updateAnswer({ associations: {} });
                setMatchingSelectedLeft(-1);
              }}>
              <Ionicons name="refresh" size={16} color="#ef4444" />
              <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Tout délier</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    case 'sorting':
      if (c.mode === 'order') {
        return <DraggableOrderList items={c.items || []} order={answer.order || Array.from({ length: c.items.length }, (_, i) => i)}
          onReorder={(o) => updateAnswer({ order: o })} disabled={isLocked} />;
      }
      return <DraggableCategoryList key={blockId} items={c.items || []} categories={c.categories || []}
        catAssignments={answer.categories || {}} onUpdate={(cats) => updateAnswer({ categories: cats })} disabled={isLocked} />;

    case 'image_position': {
      const imageUrl = c.image_file_id ? `${BASE_URL}/exercises/block-image/${c.image_file_id}`
        : c.image_url ? (c.image_url.startsWith('http') ? c.image_url : `${BASE_URL}${c.image_url}`) : null;
      if (!imageUrl) return <Text style={{ color: '#ef4444' }}>Image non disponible</Text>;

      // IMAGE LABELS MODE
      if (c.interaction_type === 'labels') {
        const labels = c.labels || [];
        const userLabels = answer.labels || {};

        return (
          <ImageLabelsMode
            imageUrl={imageUrl}
            labels={labels}
            userLabels={userLabels}
            onUpdate={(nl) => updateAnswer({ labels: nl })}
            isLocked={isLocked}
          />
        );
      }

      // ZONES CLICKABLE MODE (original)
      let correctZones = null;
      if (feedback) {
        correctZones = c.zones || [];
      }

      return (
        <View>
          <ImageInteractive
            imageUrl={imageUrl}
            zones={c.zones || []}
            clicks={answer.clicks || []}
            onClicksChange={(cl) => updateAnswer({ clicks: cl })}
            disabled={isLocked}
            correctZones={correctZones}
          />
          {!isLocked && answer.clicks && answer.clicks.length > 0 && (
            <TouchableOpacity
              style={questionStyles.undoButton}
              onPress={() => {
                const newClicks = answer.clicks.slice(0, -1);
                updateAnswer({ clicks: newClicks });
              }}
            >
              <Ionicons name="arrow-undo" size={18} color="#FFF" />
              <Text style={questionStyles.undoButtonText}>Annuler le dernier clic</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    case 'graph': {
      const ca = c.correct_answer || {};

      // find_expression: show static graph + coefficient inputs
      if (c.question_type === 'find_expression') {
        const findType = c.find_type || 'linear';
        const coeffAnswer = answer.coefficients || {};
        return (
          <View>
            <Text style={questionStyles.graphExpression}>Trouve l'expression de la fonction :</Text>
            <GraphInteractive config={{...c, question_type: findType === 'quadratic' ? 'draw_quadratic' : 'draw_line', static_mode: true}} onPointsChange={() => {}} disabled={true} />
            <View style={questionStyles.findExprContainer}>
              <Text style={questionStyles.findExprLabel}>
                {findType === 'quadratic' ? 'f(x) = ax² + bx + c' : 'f(x) = ax + b'}
              </Text>
              <View style={questionStyles.findExprRow}>
                <Text style={questionStyles.findExprCoeffLabel}>a =</Text>
                <TextInput style={questionStyles.findExprInput} keyboardType="numbers-and-punctuation"
                  value={coeffAnswer.a != null ? String(coeffAnswer.a) : ''}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9.\-]/g, '');
                    updateAnswer({ coefficients: { ...coeffAnswer, a: cleaned === '' || cleaned === '-' ? cleaned : parseFloat(cleaned) || 0 }});
                  }}
                  editable={!isLocked} placeholder="0" />
                <Text style={questionStyles.findExprCoeffLabel}>b =</Text>
                <TextInput style={questionStyles.findExprInput} keyboardType="numbers-and-punctuation"
                  value={coeffAnswer.b != null ? String(coeffAnswer.b) : ''}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9.\-]/g, '');
                    updateAnswer({ coefficients: { ...coeffAnswer, b: cleaned === '' || cleaned === '-' ? cleaned : parseFloat(cleaned) || 0 }});
                  }}
                  editable={!isLocked} placeholder="0" />
                {findType === 'quadratic' && (
                  <>
                    <Text style={questionStyles.findExprCoeffLabel}>c =</Text>
                    <TextInput style={questionStyles.findExprInput} keyboardType="numbers-and-punctuation"
                      value={coeffAnswer.c != null ? String(coeffAnswer.c) : ''}
                      onChangeText={(t) => {
                        const cleaned = t.replace(/[^0-9.\-]/g, '');
                        updateAnswer({ coefficients: { ...coeffAnswer, c: cleaned === '' || cleaned === '-' ? cleaned : parseFloat(cleaned) || 0 }});
                      }}
                      editable={!isLocked} placeholder="0" />
                  </>
                )}
              </View>
            </View>
          </View>
        );
      }

      // Auto-generate expression text from correct_answer
      let exprText = '';
      if (c.question_type === 'draw_quadratic') {
        const aStr = ca.a === 1 ? '' : ca.a === -1 ? '-' : (ca.a != null ? String(ca.a) : '');
        const bPart = ca.b > 0 ? ` + ${ca.b}x` : ca.b < 0 ? ` - ${-ca.b}x` : '';
        const cPart = ca.c > 0 ? ` + ${ca.c}` : ca.c < 0 ? ` - ${-ca.c}` : '';
        exprText = `f(x) = ${aStr}x² ${bPart}${cPart}`;
      } else {
        const aStr = ca.a === 1 ? '' : ca.a === -1 ? '-' : (ca.a != null ? String(ca.a) : '');
        const bPart = ca.b > 0 ? ` + ${ca.b}` : ca.b < 0 ? ` - ${-ca.b}` : '';
        exprText = `f(x) = ${aStr}x${bPart}`;
      }
      return (
        <View>
          {c.question ? <MathText text={c.question} style={questionStyles.questionText} /> : null}
          {!c.question && exprText ? <Text style={questionStyles.graphExpression}>Trace : {exprText}</Text> : null}
          <GraphInteractive config={c} onPointsChange={(pts) => updateAnswer({ points: pts })} disabled={isLocked} />
        </View>
      );
    }

    default:
      return <Text style={questionStyles.questionText}>Type non supporté</Text>;
  }
}

// ============================================================
// STYLES
// ============================================================

const dndStyles = StyleSheet.create({
  container: { gap: 8 },
  hint: { fontSize: 12, color: '#667eea', fontWeight: '600', textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },
  item: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 2, borderColor: '#e5e7eb' },
  itemSelected: { borderColor: '#667eea', backgroundColor: '#eef2ff', shadowColor: '#667eea', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  itemTarget: { borderColor: '#a5b4fc', borderStyle: 'dashed' },
  grip: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  gripSelected: { backgroundColor: '#667eea' },
  num: { fontSize: 15, fontWeight: '800', color: '#667eea', marginRight: 10, width: 28 },
  text: { fontSize: 14, color: '#374151', flex: 1 },
  textSelected: { fontWeight: '700', color: '#1e1b4b' },
  selectedCheckmark: { marginLeft: 8 },
  selectedBadge: { backgroundColor: '#667eea', borderRadius: 12, padding: 4 },
  catZone: { borderWidth: 2, borderColor: '#d1d5db', borderStyle: 'dashed', borderRadius: 14, padding: 12, marginBottom: 10, minHeight: 60, backgroundColor: '#fafafa' },
  catZoneTarget: { borderColor: '#667eea', backgroundColor: '#eef2ff' },
  catName: { fontSize: 14, fontWeight: '700', color: '#4b5563', marginBottom: 8 },
  catItems: { gap: 6 },
  catItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#667eea', flexShrink: 0 },
  catItemPicked: { backgroundColor: '#c7d2fe', borderColor: '#4f46e5' },
  catItemText: { fontSize: 13, color: '#4338ca', fontWeight: '600' },
  catEmpty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  pool: { marginTop: 10, padding: 12, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 14, backgroundColor: '#FFF' },
  poolTarget: { borderColor: '#667eea', backgroundColor: '#eef2ff' },
  poolLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  poolItems: { gap: 8 },
  poolItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', flexShrink: 0 },
  poolItemPicked: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  poolItemText: { fontSize: 14, color: '#374151' },
});

const imgStyles = StyleSheet.create({
  hint: { fontSize: 14, color: '#374151', marginBottom: 4, lineHeight: 22 },
  subHint: { fontSize: 12, color: '#667eea', fontWeight: '600', marginBottom: 10 },
  container: { position: 'relative', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  marker: { position: 'absolute', width: 28, height: 28, backgroundColor: '#ef4444', borderRadius: 14, borderWidth: 3, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  markerLabel: { fontSize: 8, fontWeight: '800', color: '#FFF' },
  correctZone: { position: 'absolute', borderWidth: 3, borderColor: '#10b981', borderRadius: 100, backgroundColor: 'rgba(16, 185, 129, 0.25)' },
  correctLabel: { position: 'absolute', backgroundColor: '#10b981', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, zIndex: 10 },
  correctLabelText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
});

const graphStyles = StyleSheet.create({
  container: {},
  hint: { fontSize: 14, color: '#374151', marginBottom: 4, lineHeight: 22 },
  question: { fontSize: 14, color: '#6b7280', marginBottom: 10, lineHeight: 22, fontStyle: 'italic' },
  webviewWrap: { width: '100%', height: Math.round(SCREEN_WIDTH * 1.1), borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  webview: { flex: 1, backgroundColor: '#fafbfc' },
});

const questionStyles = StyleSheet.create({
  questionText: { fontSize: 14, color: '#374151', marginBottom: 12, lineHeight: 22 },
  graphExpression: { fontSize: 18, fontWeight: '800', color: '#1e1b4b', marginBottom: 12, fontStyle: 'italic', textAlign: 'center' },
  optionsContainer: { gap: 10 },
  optionButton: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#e5e7eb' },
  optionButtonSelected: { borderColor: '#667eea', backgroundColor: '#eef2ff' },
  optionRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  optionRadioSelected: { borderColor: '#667eea', backgroundColor: '#667eea' },
  optionText: { fontSize: 14, color: '#374151', flex: 1 },
  textInput: { borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 15, color: '#374151', backgroundColor: '#fafafa' },
  fillBlankWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  fillBlankText: { fontSize: 15, color: '#374151', lineHeight: 36 },
  fillBlankInput: { borderBottomWidth: 2, borderBottomColor: '#667eea', paddingHorizontal: 8, paddingVertical: 4, minWidth: 70, fontSize: 15, color: '#374151', textAlign: 'center' },
  fillBlankSelectWrap: { marginHorizontal: 4 },
  fillBlankSelect: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: '#667eea', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#eef2ff', minWidth: 100 },
  fillBlankSelectFilled: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  fillBlankSelectText: { fontSize: 14, color: '#374151', fontWeight: '600' },
  matchingContainer: { flexDirection: 'row', gap: 10 },
  matchingCol: { flex: 1 },
  matchingColTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase' },
  matchingItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 2, borderColor: '#d1d5db', borderRadius: 10, marginBottom: 8, backgroundColor: '#ffffff' },
  matchingItemSelected: { borderColor: '#667eea', backgroundColor: '#eef2ff' },
  matchingItemMatched: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  matchingItemText: { fontSize: 14, color: '#1e1b4b', flex: 1 },
  matchingNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#667eea', alignItems: 'center', justifyContent: 'center' },
  matchingNumText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  findExprContainer: { backgroundColor: '#f0f4ff', borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 2, borderColor: '#c7d2fe' },
  findExprLabel: { fontWeight: '600', color: '#4338ca', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  findExprRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  findExprCoeffLabel: { fontWeight: '500', fontSize: 16, color: '#374151' },
  findExprInput: { width: 65, padding: 8, borderWidth: 2, borderColor: '#a5b4fc', borderRadius: 8, fontSize: 16, textAlign: 'center', backgroundColor: '#fff' },
  undoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#667eea', borderRadius: 12, paddingVertical: 12, marginTop: 12 },
  undoButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
});
