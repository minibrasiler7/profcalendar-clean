import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import api from '../../api/client';
import colors from '../../theme/colors';

const BASE_URL = 'https://profcalendar-clean.onrender.com';
const SCREEN_WIDTH = Dimensions.get('window').width;

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
function DraggableOrderList({ items, order, onReorder, disabled, onDragStart, onDragEnd }) {
  const [selectedPos, setSelectedPos] = useState(null);

  const handleTapItem = (pos) => {
    if (disabled) return;

    // If same item is tapped again, deselect it
    if (selectedPos === pos) {
      setSelectedPos(null);
      if (onDragEnd) onDragEnd();
      return;
    }

    // If no item is selected, select this one
    if (selectedPos === null) {
      setSelectedPos(pos);
      if (onDragStart) onDragStart();
      return;
    }

    // If a different item is selected, move the selected item to this position
    const newOrder = [...order];
    const itemToMove = newOrder[selectedPos];
    // Remove from old position
    newOrder.splice(selectedPos, 1);
    // Insert at new position
    newOrder.splice(pos, 0, itemToMove);

    onReorder(newOrder);
    setSelectedPos(null);
    if (onDragEnd) onDragEnd();
  };

  return (
    <View style={dndStyles.container}>
      <Text style={dndStyles.hint}>
        Touche un élément pour le sélectionner, puis touche sa nouvelle position
      </Text>
      {order.map((origIdx, pos) => {
        const isSelected = selectedPos === pos;
        return (
          <TouchableOpacity
            key={`${origIdx}-${pos}`}
            style={[
              dndStyles.item,
              isSelected && dndStyles.itemSelected,
            ]}
            onPress={() => handleTapItem(pos)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <View style={[dndStyles.grip, isSelected && dndStyles.gripSelected]}>
              <Ionicons
                name="reorder-three"
                size={22}
                color={isSelected ? '#FFF' : '#9ca3af'}
              />
            </View>
            <Text style={dndStyles.num}>{pos + 1}.</Text>
            <Text style={[dndStyles.text, isSelected && dndStyles.textSelected]}>
              {items[origIdx]}
            </Text>
            {isSelected && (
              <View style={dndStyles.selectedCheckmark}>
                <Ionicons name="checkmark-circle" size={20} color="#667eea" />
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
            <Text style={dndStyles.catName}>
              <Ionicons name="folder-open" size={14} color="#4b5563" /> {cat.name}
            </Text>
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
                  <Text style={dndStyles.catItemText}>{items[itemIdx]}</Text>
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
                <Text style={dndStyles.poolItemText}>{item}</Text>
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

  useEffect(() => {
    if (imageUrl) {
      Image.getSize(imageUrl, (w, h) => setImgNatural({ w, h }), () => {});
    }
  }, [imageUrl]);

  const handleTouch = (evt) => {
    if (disabled || !imgLayout || !imgNatural) return;
    const { locationX, locationY } = evt.nativeEvent;
    const scaleX = imgNatural.w / imgLayout.width;
    const scaleY = imgNatural.h / imgLayout.height;
    const x = Math.round(locationX * scaleX);
    const y = Math.round(locationY * scaleY);

    const expected = zones.length || 1;
    let newClicks = [...clicks];
    if (newClicks.length >= expected) {
      newClicks = [];
    }
    newClicks.push({ x, y });
    onClicksChange(newClicks);
  };

  const imgWidth = SCREEN_WIDTH - 48;
  const imgHeight = imgNatural ? (imgWidth / imgNatural.w) * imgNatural.h : 300;

  const renderCorrectZones = () => {
    if (!correctZones || !imgLayout || !imgNatural) return null;
    return correctZones.map((zone, zIdx) => {
      const zonePoints = zone.get ? zone.get('points', []) : zone.points || [];
      const zoneLabel = zone.get ? zone.get('label', '') : zone.label || '';
      const radius = zone.get ? zone.get('radius', 30) : zone.radius || 30;

      return zonePoints.map((pt, pIdx) => {
        const ptX = pt.get ? pt.get('x', 0) : pt.x || 0;
        const ptY = pt.get ? pt.get('y', 0) : pt.y || 0;
        const dispX = (ptX / imgNatural.w) * imgLayout.width;
        const dispY = (ptY / imgNatural.h) * imgLayout.height;
        const dispRadius = (radius / imgNatural.w) * imgLayout.width;

        return (
          <View
            key={`correct-${zIdx}-${pIdx}`}
            style={[
              imgStyles.correctZone,
              {
                left: dispX - dispRadius,
                top: dispY - dispRadius,
                width: dispRadius * 2,
                height: dispRadius * 2,
              },
            ]}
          />
        );
      });
    });
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
        style={[imgStyles.container, { width: imgWidth, height: imgHeight }]}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleTouch}
      >
        <Image
          source={{ uri: imageUrl }}
          style={{ width: imgWidth, height: imgHeight }}
          resizeMode="contain"
          onLayout={(e) => setImgLayout(e.nativeEvent.layout)}
        />
        {renderCorrectZones()}
        {clicks.map((click, i) => {
          if (!imgLayout || !imgNatural) return null;
          const dispX = (click.x / imgNatural.w) * imgLayout.width;
          const dispY = (click.y / imgNatural.h) * imgLayout.height;
          return (
            <View key={i} style={[imgStyles.marker, { left: dispX - 14, top: dispY - 14 }]}>
              <Text style={imgStyles.markerLabel}>{zones[i]?.label || (i + 1)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================
// Graph Interactive — WebView with canvas
// ============================================================
function GraphInteractive({ config, onPointsChange, disabled }) {
  const webviewRef = useRef(null);

  const htmlContent = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fafbfc;display:flex;flex-direction:column;align-items:center;height:100vh;touch-action:none;overflow:hidden}
canvas{display:block;width:100%;height:auto}
.zoom-bar{display:flex;gap:8px;padding:6px 0;justify-content:center}
.zoom-btn{width:40px;height:36px;border:2px solid #d1d5db;border-radius:10px;background:#fff;font-size:20px;font-weight:700;color:#374151;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.zoom-btn:active{background:#eef2ff;border-color:#667eea}
.zoom-label{font-size:12px;color:#9ca3af;display:flex;align-items:center;font-weight:600}</style>
</head><body>
<div class="zoom-bar">
  <div class="zoom-btn" id="zout">-</div>
  <div class="zoom-label" id="zlbl">x1</div>
  <div class="zoom-btn" id="zin">+</div>
  <div class="zoom-btn" id="zrst" style="font-size:14px;width:50px">Reset</div>
</div>
<canvas id="g"></canvas>
<script>
const c=${JSON.stringify(config)};const cv=document.getElementById('g');const x=cv.getContext('2d');
const W=600,H=480,M=50,d=window.devicePixelRatio||2;cv.width=W*d;cv.height=H*d;cv.style.width=W+'px';cv.style.height=H+'px';x.scale(d,d);
const isQ=c.question_type==='draw_quadratic',nP=isQ?3:2;
const origXMin=c.x_min,origXMax=c.x_max,origYMin=c.y_min,origYMax=c.y_max;
let zXMin=c.x_min,zXMax=c.x_max,zYMin=c.y_min,zYMax=c.y_max,zLvl=1;
const xR=c.x_max-c.x_min,pts=[];
for(let i=0;i<nP;i++)pts.push({x:Math.round(c.x_min+xR*(i+1)/(nP+1)),y:0});let dr=-1;
let pinchDist=0,isPinch=false;
function g2p(gx,gy){const gw=W-2*M,gh=H-2*M;return{px:M+((gx-zXMin)/(zXMax-zXMin))*gw,py:H-M-((gy-zYMin)/(zYMax-zYMin))*gh}}
function p2g(px,py){const gw=W-2*M,gh=H-2*M;return{x:zXMin+((px-M)/gw)*(zXMax-zXMin),y:zYMin+((H-M-py)/gh)*(zYMax-zYMin)}}
function setZoom(lvl){zLvl=Math.max(1,Math.min(lvl,5));const cx=(origXMin+origXMax)/2,cy=(origYMin+origYMax)/2;const hw=(origXMax-origXMin)/(2*zLvl),hh=(origYMax-origYMin)/(2*zLvl);zXMin=cx-hw;zXMax=cx+hw;zYMin=cy-hh;zYMax=cy+hh;document.getElementById('zlbl').textContent='x'+zLvl;draw()}
document.getElementById('zin').onclick=()=>setZoom(zLvl+1);
document.getElementById('zout').onclick=()=>setZoom(zLvl-1);
document.getElementById('zrst').onclick=()=>setZoom(1);
function stepForRange(range){if(range<=4)return 0.5;if(range<=10)return 1;if(range<=20)return 2;return 5}
function draw(){x.clearRect(0,0,W,H);x.fillStyle='#fafbfc';x.fillRect(0,0,W,H);
const xStep=stepForRange(zXMax-zXMin),yStep=stepForRange(zYMax-zYMin);
x.strokeStyle='#e5e7eb';x.lineWidth=1;
for(let i=Math.ceil(zXMin/xStep)*xStep;i<=zXMax;i+=xStep){const p=g2p(i,0);x.beginPath();x.moveTo(p.px,M);x.lineTo(p.px,H-M);x.stroke()}
for(let i=Math.ceil(zYMin/yStep)*yStep;i<=zYMax;i+=yStep){const p=g2p(0,i);x.beginPath();x.moveTo(M,p.py);x.lineTo(W-M,p.py);x.stroke()}
const o=g2p(0,0);x.strokeStyle='#1f2937';x.lineWidth=2;x.beginPath();x.moveTo(M,Math.max(M,Math.min(H-M,o.py)));x.lineTo(W-M,Math.max(M,Math.min(H-M,o.py)));x.stroke();x.beginPath();x.moveTo(Math.max(M,Math.min(W-M,o.px)),M);x.lineTo(Math.max(M,Math.min(W-M,o.px)),H-M);x.stroke();
x.fillStyle='#374151';x.font='bold 14px sans-serif';x.fillText(c.x_label||'x',W-M+8,Math.max(M,Math.min(H-M,o.py))+5);x.fillText(c.y_label||'y',Math.max(M,Math.min(W-M,o.px))+8,M-12);
x.font='12px sans-serif';x.fillStyle='#6b7280';
for(let i=Math.ceil(zXMin/xStep)*xStep;i<=zXMax;i+=xStep){if(Math.abs(i)<0.001)continue;const p=g2p(i,0);x.textAlign='center';x.fillText(xStep<1?i.toFixed(1):Math.round(i),p.px,Math.min(H-M+18,o.py+18))}
x.textAlign='right';for(let i=Math.ceil(zYMin/yStep)*yStep;i<=zYMax;i+=yStep){if(Math.abs(i)<0.001)continue;const p=g2p(0,i);x.fillText(yStep<1?i.toFixed(1):Math.round(i),Math.max(M-2,o.px-8),p.py+4)}x.textAlign='left';
let fn=null;if(isQ&&pts.length>=3){const[a,b,e]=pts;const dt=(a.x**2*(b.x-e.x)-b.x**2*(a.x-e.x)+e.x**2*(a.x-b.x));if(Math.abs(dt)>0.001){const ca=(a.y*(b.x-e.x)-b.y*(a.x-e.x)+e.y*(a.x-b.x))/dt;const cb=(a.x**2*(b.y-e.y)-b.x**2*(a.y-e.y)+e.x**2*(a.y-b.y))/dt;const cc=(a.x**2*(b.x*e.y-e.x*b.y)-b.x**2*(a.x*e.y-e.x*a.y)+e.x**2*(a.x*b.y-b.x*a.y))/dt;fn=v=>ca*v*v+cb*v+cc}}
else if(pts.length>=2){const dx=pts[1].x-pts[0].x;if(Math.abs(dx)>0.001){const a=(pts[1].y-pts[0].y)/dx;const b=pts[0].y-a*pts[0].x;fn=v=>a*v+b}}
if(fn&&!c.static_mode){x.strokeStyle='#667eea';x.lineWidth=3;x.lineCap='round';x.beginPath();let s=false;const st=(zXMax-zXMin)/400;for(let i=zXMin;i<=zXMax;i+=st){const y=fn(i);const p=g2p(i,y);if(p.py<M-5||p.py>H-M+5){s=false;continue}if(!s){x.moveTo(p.px,p.py);s=true}else x.lineTo(p.px,p.py)}x.stroke()}
if(c.static_mode&&c.correct_answer){let sfn=null;const ca=c.correct_answer;if(c.question_type==='draw_quadratic'){sfn=v=>(ca.a||0)*v*v+(ca.b||0)*v+(ca.c||0)}else{sfn=v=>(ca.a||0)*v+(ca.b||0)}if(sfn){x.strokeStyle='#667eea';x.lineWidth=3;x.lineCap='round';x.beginPath();let s=false;const st=(zXMax-zXMin)/400;for(let i=zXMin;i<=zXMax;i+=st){const y=sfn(i);const p=g2p(i,y);if(p.py<M-5||p.py>H-M+5){s=false;continue}if(!s){x.moveTo(p.px,p.py);s=true}else x.lineTo(p.px,p.py)}x.stroke()}}
if(!c.static_mode){pts.forEach((pt,i)=>{const p=g2p(pt.x,pt.y);if(p.px<M-5||p.px>W-M+5||p.py<M-5||p.py>H-M+5)return;x.fillStyle=(i===dr)?'rgba(220,38,38,0.2)':'rgba(16,185,129,0.2)';x.beginPath();x.arc(p.px,p.py,18,0,Math.PI*2);x.fill();x.fillStyle=i===dr?'#dc2626':'#10b981';x.strokeStyle='white';x.lineWidth=3;x.beginPath();x.arc(p.px,p.py,12,0,Math.PI*2);x.fill();x.stroke();x.fillStyle='white';x.font='bold 12px sans-serif';x.textAlign='center';x.fillText(String.fromCharCode(65+i),p.px,p.py+4);x.textAlign='left';x.fillStyle='#1e1b4b';x.font='bold 12px sans-serif';x.fillText('('+Math.round(pt.x*10)/10+', '+Math.round(pt.y*10)/10+')',p.px+18,p.py-6)})}}
function gXY(e){const r=cv.getBoundingClientRect();const sx=W/r.width,sy=H/r.height;const t=e.touches?e.touches[0]:e;return{px:(t.clientX-r.left)*sx,py:(t.clientY-r.top)*sy}}
function sp(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'points',points:pts.map(p=>({x:p.x,y:p.y}))}))}
const dis=${disabled ? 'true' : 'false'};
function getDist(e){if(e.touches.length<2)return 0;const a=e.touches[0],b=e.touches[1];return Math.sqrt((a.clientX-b.clientX)**2+(a.clientY-b.clientY)**2)}
cv.addEventListener('touchstart',e=>{e.preventDefault();if(dis)return;if(e.touches.length===2){isPinch=true;pinchDist=getDist(e);dr=-1;return}isPinch=false;const{px,py}=gXY(e);for(let i=0;i<pts.length;i++){const p=g2p(pts[i].x,pts[i].y);if(Math.sqrt((px-p.px)**2+(py-p.py)**2)<30){dr=i;break}}},{passive:false});
cv.addEventListener('touchmove',e=>{e.preventDefault();if(isPinch&&e.touches.length===2){const nd=getDist(e);if(pinchDist>0){const ratio=nd/pinchDist;if(ratio>1.15)setZoom(zLvl+1);else if(ratio<0.85)setZoom(zLvl-1);pinchDist=nd}return}if(dr<0)return;const{px,py}=gXY(e);const g=p2g(px,py);const snap=zLvl>=3?0.25:0.5;pts[dr].x=Math.round(g.x/snap)*snap;pts[dr].y=Math.round(g.y/snap)*snap;draw()},{passive:false});
cv.addEventListener('touchend',e=>{if(isPinch){isPinch=e.touches.length>=2;pinchDist=0;return}dr=-1;draw();sp()});draw();sp();
</script></body></html>`;

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'points') onPointsChange(data.points);
    } catch (e) {}
  };

  return (
    <View style={graphStyles.container}>
      <Text style={graphStyles.hint}>
        {config.question_type === 'draw_quadratic'
          ? 'Déplace les 3 points pour tracer la courbe.'
          : 'Déplace les 2 points pour tracer la droite.'}
      </Text>
      {config.question ? <Text style={graphStyles.question}>{config.question}</Text> : null}
      <View style={graphStyles.webviewWrap}>
        <WebView
          ref={webviewRef}
          source={{ html: htmlContent }}
          style={graphStyles.webview}
          scrollEnabled={false}
          scrollEventThrottle={16}
          bounces={false}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          originWhitelist={['*']}
          pointerEvents="box-none"
        />
      </View>
    </View>
  );
}

// ============================================================
// MAIN SCREEN
// ============================================================
export default function ExerciseSolveScreen({ route, navigation }) {
  const { missionId } = route.params;
  const insets = useSafeAreaInsets();
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [answers, setAnswers] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [resultModal, setResultModal] = useState(false);
  const [result, setResult] = useState(null);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [questionLocked, setQuestionLocked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSadEmojis, setShowSadEmojis] = useState(false);
  const confettiAnims = useRef([...Array(20)].map(() => ({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    opacity: new Animated.Value(0),
    rotate: new Animated.Value(0),
  }))).current;
  const sadAnims = useRef([...Array(6)].map(() => ({
    y: new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale: new Animated.Value(1),
  }))).current;

  const fetchExercise = async () => {
    try {
      const res = await api.get(`/student/missions/${missionId}`);
      const m = res.data.mission;
      setMission(m);
      initializeAnswers(m);
    } catch (err) {
      console.log('Exercise error:', err.response?.data);
      Alert.alert('Erreur', "Impossible de charger l'exercice");
    } finally {
      setLoading(false);
    }
  };

  const initializeAnswers = (m) => {
    const initial = {};
    (m.blocks || []).forEach((block) => {
      const c = block.config_json || {};
      if (block.block_type === 'qcm') {
        initial[block.id] = { selected: [] };
      } else if (block.block_type === 'short_answer') {
        initial[block.id] = { value: '' };
      } else if (block.block_type === 'fill_blank') {
        const template = c.text_template || '';
        const matches = template.match(/\{[^}]+\}/g) || [];
        initial[block.id] = { blanks: matches.map(() => '') };
      } else if (block.block_type === 'sorting') {
        if (c.mode === 'order') {
          const indices = (c.items || []).map((_, i) => i).filter(i => c.items[i]);
          initial[block.id] = { order: shuffleArray(indices) };
        } else {
          // Category mode: items start unassigned, so we initialize with empty categories
          // The pool items will be shuffled dynamically when rendered (see DraggableCategoryList)
          initial[block.id] = { categories: {} };
        }
      } else if (block.block_type === 'image_position') {
        initial[block.id] = { clicks: [] };
      } else if (block.block_type === 'graph') {
        initial[block.id] = { points: [] };
      }
    });
    setAnswers(initial);
  };

  useFocusEffect(useCallback(() => { fetchExercise(); }, [missionId]));

  const blocks = mission?.blocks || [];
  const totalBlocks = blocks.length;
  const currentBlock = blocks[currentIdx];

  const updateAnswer = (blockId, data) => {
    setAnswers(prev => ({ ...prev, [blockId]: data }));
  };

  const hasAnswer = (block, answer) => {
    const c = block.config_json || {};
    if (block.block_type === 'qcm') return (answer?.selected || []).length > 0;
    if (block.block_type === 'short_answer') return (answer?.value || '').trim().length > 0;
    if (block.block_type === 'fill_blank') return (answer?.blanks || []).some(b => b.trim().length > 0);
    if (block.block_type === 'sorting') {
      if (c.mode !== 'order') return Object.values(answer?.categories || {}).flat().length > 0;
      return true;
    }
    if (block.block_type === 'image_position') return (answer?.clicks || []).length > 0;
    if (block.block_type === 'graph') {
      const gc = block.config_json || {};
      if (gc.question_type === 'find_expression') {
        const coeffs = answer?.coefficients || {};
        return coeffs.a != null || coeffs.b != null;
      }
      return (answer?.points || []).length > 0;
    }
    return true;
  };

  // ---- Animations ----
  const playCorrectAnimation = () => {
    setShowConfetti(true);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.08, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    Animated.timing(feedbackOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    confettiAnims.forEach((anim, i) => {
      const startX = (Math.random() - 0.5) * SCREEN_WIDTH;
      anim.x.setValue(startX);
      anim.y.setValue(0);
      anim.opacity.setValue(1);
      anim.rotate.setValue(0);
      const delay = Math.random() * 300;
      Animated.parallel([
        Animated.timing(anim.y, { toValue: -(200 + Math.random() * 400), duration: 1500 + Math.random() * 500, delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(anim.opacity, { toValue: 1, duration: 100, delay, useNativeDriver: true }),
          Animated.timing(anim.opacity, { toValue: 0, duration: 1200, delay: delay + 500, useNativeDriver: true }),
        ]),
        Animated.timing(anim.rotate, { toValue: 720, duration: 2000, delay, useNativeDriver: true }),
      ]).start();
    });
    setTimeout(() => setShowConfetti(false), 2500);
  };

  const playIncorrectAnimation = () => {
    setShowSadEmojis(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 12, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
    Animated.timing(feedbackOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    sadAnims.forEach((anim, i) => {
      const delay = i * 100;
      anim.y.setValue(0); anim.opacity.setValue(0); anim.scale.setValue(1);
      Animated.parallel([
        Animated.timing(anim.y, { toValue: -120, duration: 1500, delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(anim.opacity, { toValue: 1, duration: 200, delay, useNativeDriver: true }),
          Animated.timing(anim.opacity, { toValue: 0, duration: 800, delay: delay + 500, useNativeDriver: true }),
        ]),
        Animated.timing(anim.scale, { toValue: 0.3, duration: 1500, delay, useNativeDriver: true }),
      ]).start();
    });
    setTimeout(() => setShowSadEmojis(false), 2000);
  };

  const validateQuestion = async () => {
    if (!currentBlock || questionLocked || checking) return;
    const blockId = currentBlock.id;
    const answer = answers[blockId];
    if (!hasAnswer(currentBlock, answer)) {
      Alert.alert('Attention', 'Tu dois répondre avant de valider !');
      return;
    }
    setChecking(true);
    try {
      const res = await api.post(`/student/missions/${missionId}/check-block`, { block_id: blockId, answer });
      const data = res.data;
      if (data.success) {
        setQuestionLocked(true);
        setFeedbackMap(prev => ({ ...prev, [blockId]: { is_correct: data.is_correct, points: data.points_earned, correct_answer: data.correct_answer } }));
        if (data.is_correct) { setCorrectCount(prev => prev + 1); playCorrectAnimation(); }
        else { playIncorrectAnimation(); }
        setXpEarned(prev => prev + data.points_earned);
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de vérifier');
    } finally {
      setChecking(false);
    }
  };

  const goToNext = () => {
    if (currentIdx < totalBlocks - 1) {
      setCurrentIdx(currentIdx + 1);
      setQuestionLocked(false);
      shakeAnim.setValue(0); scaleAnim.setValue(1); feedbackOpacity.setValue(0);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Convert answers object to list format expected by API
      const answersList = Object.entries(answers).map(([blockId, answerData]) => ({
        block_id: parseInt(blockId, 10),
        answer: answerData,
      }));
      const res = await api.post(`/student/missions/${missionId}/submit`, { answers: answersList });
      setResult(res.data);
      setResultModal(true);
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de soumettre');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResultClose = () => {
    setResultModal(false);
    navigation.goBack();
  };

  if (loading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!mission) return <View style={styles.centerContainer}><Text style={styles.errorText}>Mission non trouvée</Text></View>;

  const currentFeedback = currentBlock ? feedbackMap[currentBlock.id] : null;
  const confettiColors = ['#10b981', '#f59e0b', '#667eea', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];
  const sadEmojis = ['😔', '💔', '😢', '😰', '🥺', '😞'];

  const renderBlock = (block) => {
    if (!block) return null;
    const c = block.config_json || {};
    const blockId = block.id;
    const answer = answers[blockId] || {};
    const isLocked = questionLocked;

    switch (block.block_type) {
      case 'qcm': {
        const isMultiple = c.multiple_answers;
        const selected = answer.selected || [];
        return (
          <View>
            {c.question ? <Text style={styles.questionText}>{c.question}</Text> : null}
            <View style={styles.optionsContainer}>
              {(c.options || []).map((opt, i) => {
                const isSel = selected.includes(i);
                return (
                  <TouchableOpacity key={i} style={[styles.optionButton, isSel && styles.optionButtonSelected]}
                    onPress={() => {
                      if (isLocked) return;
                      const newSel = isMultiple ? (isSel ? selected.filter(x => x !== i) : [...selected, i]) : [i];
                      updateAnswer(blockId, { selected: newSel });
                    }} disabled={isLocked}>
                    <View style={[styles.optionRadio, isSel && styles.optionRadioSelected]}>
                      {isSel && <Ionicons name="checkmark" size={12} color="#FFF" />}
                    </View>
                    <Text style={styles.optionText}>{opt.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      }
      case 'short_answer':
        return (
          <View>
            {c.question ? <Text style={styles.questionText}>{c.question}</Text> : null}
            <TextInput style={styles.textInput} placeholder="Ta réponse..." placeholderTextColor={colors.textLight}
              value={answer.value || ''} onChangeText={(t) => updateAnswer(blockId, { value: t })}
              keyboardType={c.answer_type === 'number' ? 'decimal-pad' : 'default'} editable={!isLocked} />
          </View>
        );
      case 'fill_blank': {
        const template = c.text_template || '';
        const parts = template.split(/(\{[^}]+\})/);
        let blankIdx = 0;
        const blanks = answer.blanks || [];
        return (
          <View><View style={styles.fillBlankWrap}>
            {parts.map((part, i) => {
              if (part.match(/^\{[^}]+\}$/)) {
                const bi = blankIdx++;
                return <TextInput key={i} style={styles.fillBlankInput} placeholder="..." placeholderTextColor={colors.textLight}
                  value={blanks[bi] || ''} onChangeText={(t) => { const nb = [...blanks]; nb[bi] = t; updateAnswer(blockId, { blanks: nb }); }} editable={!isLocked} />;
              }
              return <Text key={i} style={styles.fillBlankText}>{part}</Text>;
            })}
          </View></View>
        );
      }
      case 'sorting':
        if (c.mode === 'order') {
          return <DraggableOrderList items={c.items || []} order={answer.order || []}
            onReorder={(o) => updateAnswer(blockId, { order: o })} disabled={isLocked}
            onDragStart={() => setIsDragging(true)} onDragEnd={() => setIsDragging(false)} />;
        }
        return <DraggableCategoryList items={c.items || []} categories={c.categories || []}
          catAssignments={answer.categories || {}} onUpdate={(cats) => updateAnswer(blockId, { categories: cats })} disabled={isLocked} />;

      case 'image_position': {
        const imageUrl = c.image_file_id ? `${BASE_URL}/exercises/block-image/${c.image_file_id}`
          : c.image_url ? (c.image_url.startsWith('http') ? c.image_url : `${BASE_URL}${c.image_url}`) : null;
        if (!imageUrl) return <Text style={{ color: '#ef4444' }}>Image non disponible</Text>;

        // Show correct zones only when answer is wrong and feedback is shown
        let correctZones = null;
        if (currentFeedback && !currentFeedback.is_correct) {
          // Pass the zones from config to show where student should have clicked
          correctZones = c.zones || [];
        }

        return (
          <View>
            <ImageInteractive
              imageUrl={imageUrl}
              zones={c.zones || []}
              clicks={answer.clicks || []}
              onClicksChange={(cl) => updateAnswer(blockId, { clicks: cl })}
              disabled={isLocked}
              correctZones={correctZones}
            />
            {!isLocked && answer.clicks && answer.clicks.length > 0 && (
              <TouchableOpacity
                style={styles.undoButton}
                onPress={() => {
                  const newClicks = answer.clicks.slice(0, -1);
                  updateAnswer(blockId, { clicks: newClicks });
                }}
              >
                <Ionicons name="arrow-undo" size={18} color="#FFF" />
                <Text style={styles.undoButtonText}>Annuler le dernier clic</Text>
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
              <Text style={styles.graphExpression}>Trouve l'expression de la fonction :</Text>
              <GraphInteractive config={{...c, question_type: findType === 'quadratic' ? 'draw_quadratic' : 'draw_line', static_mode: true}} disabled={true} />
              <View style={styles.findExprContainer}>
                <Text style={styles.findExprLabel}>
                  {findType === 'quadratic' ? 'f(x) = ax² + bx + c' : 'f(x) = ax + b'}
                </Text>
                <View style={styles.findExprRow}>
                  <Text style={styles.findExprCoeffLabel}>a =</Text>
                  <TextInput style={styles.findExprInput} keyboardType="numeric"
                    value={coeffAnswer.a != null ? String(coeffAnswer.a) : ''}
                    onChangeText={(t) => updateAnswer(blockId, { coefficients: { ...coeffAnswer, a: parseFloat(t) || 0 }})}
                    editable={!isLocked} placeholder="0" />
                  <Text style={styles.findExprCoeffLabel}>b =</Text>
                  <TextInput style={styles.findExprInput} keyboardType="numeric"
                    value={coeffAnswer.b != null ? String(coeffAnswer.b) : ''}
                    onChangeText={(t) => updateAnswer(blockId, { coefficients: { ...coeffAnswer, b: parseFloat(t) || 0 }})}
                    editable={!isLocked} placeholder="0" />
                  {findType === 'quadratic' && (
                    <>
                      <Text style={styles.findExprCoeffLabel}>c =</Text>
                      <TextInput style={styles.findExprInput} keyboardType="numeric"
                        value={coeffAnswer.c != null ? String(coeffAnswer.c) : ''}
                        onChangeText={(t) => updateAnswer(blockId, { coefficients: { ...coeffAnswer, c: parseFloat(t) || 0 }})}
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
            {c.question ? <Text style={styles.questionText}>{c.question}</Text> : null}
            {c.show_expression !== false && exprText ? <Text style={styles.graphExpression}>Trace : {exprText}</Text> : null}
            <GraphInteractive config={c} onPointsChange={(pts) => updateAnswer(blockId, { points: pts })} disabled={isLocked} />
          </View>
        );
      }
      default:
        return <Text style={styles.questionText}>Type non supporté</Text>;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>Question {currentIdx + 1}/{totalBlocks}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentIdx + 1) / totalBlocks) * 100}%` }]} />
        </View>
        <View style={styles.scoreTracker}>
          <Ionicons name="checkmark-circle" size={16} color="#10b981" />
          <Text style={styles.scoreText}>{correctCount}/{Object.keys(feedbackMap).length}</Text>
          <Text style={styles.xpBadge}>{xpEarned} XP</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} scrollEnabled={!isDragging}>
        {currentBlock && (
          <Animated.View style={[styles.blockContainer,
            currentFeedback?.is_correct === true && styles.blockCorrect,
            currentFeedback?.is_correct === false && styles.blockIncorrect,
            { transform: [{ translateX: shakeAnim }, { scale: scaleAnim }] }]}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTypeBadge}>
                {currentBlock.block_type === 'qcm' ? 'QCM' : currentBlock.block_type === 'short_answer' ? 'Réponse' :
                 currentBlock.block_type === 'fill_blank' ? 'Trou' : currentBlock.block_type === 'sorting' ? 'Tri' :
                 currentBlock.block_type === 'image_position' ? 'Image' : currentBlock.block_type === 'graph' ? 'Graphique' : ''}
              </Text>
              <Text style={styles.blockPoints}><Ionicons name="star" size={14} color="#f59e0b" /> {currentBlock.points} XP</Text>
            </View>
            <Text style={styles.blockTitle}>{currentBlock.title || `Question ${currentIdx + 1}`}</Text>
            {renderBlock(currentBlock)}
            {currentFeedback && (
              <Animated.View style={[styles.feedbackBanner, currentFeedback.is_correct ? styles.feedbackCorrect : styles.feedbackIncorrect, { opacity: feedbackOpacity }]}>
                <Text style={styles.feedbackEmoji}>{currentFeedback.is_correct ? '🎉' : '😔'}</Text>
                <View style={styles.feedbackTextWrap}>
                  <Text style={[styles.feedbackText, { color: currentFeedback.is_correct ? '#166534' : '#991b1b' }]}>
                    {currentFeedback.is_correct ? 'Bravo ! Bonne réponse !' : 'Pas tout à fait...'}
                  </Text>
                  {!currentFeedback.is_correct && currentFeedback.correct_answer ? (
                    <View style={styles.correctAnswerBox}>
                      <Ionicons name="checkmark-circle" size={14} color="#166534" />
                      <Text style={styles.correctAnswerText}>
                        Réponse : {typeof currentFeedback.correct_answer === 'object'
                          ? (currentFeedback.correct_answer.text || JSON.stringify(currentFeedback.correct_answer))
                          : String(currentFeedback.correct_answer)}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.feedbackPoints}>+{currentFeedback.points} XP</Text>
                </View>
              </Animated.View>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {showConfetti && <View style={styles.confettiOverlay} pointerEvents="none">
        {confettiAnims.map((anim, i) => <Animated.View key={i} style={[styles.confettiPiece,
          { backgroundColor: confettiColors[i % confettiColors.length], left: SCREEN_WIDTH / 2, bottom: 100,
            transform: [{ translateX: anim.x }, { translateY: anim.y },
              { rotate: anim.rotate.interpolate({ inputRange: [0, 720], outputRange: ['0deg', '720deg'] }) }],
            opacity: anim.opacity }]} />)}
      </View>}

      {showSadEmojis && <View style={styles.confettiOverlay} pointerEvents="none">
        {sadAnims.map((anim, i) => <Animated.Text key={i} style={[styles.sadEmoji,
          { left: 40 + (i * (SCREEN_WIDTH - 80) / 5), top: Dimensions.get('window').height * 0.4,
            transform: [{ translateY: anim.y }, { scale: anim.scale }], opacity: anim.opacity }]}>
          {sadEmojis[i % sadEmojis.length]}</Animated.Text>)}
      </View>}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {!questionLocked ? (
          <TouchableOpacity style={styles.validateButton} onPress={validateQuestion} disabled={checking}>
            {checking ? <ActivityIndicator size="small" color="#FFF" /> : <>
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={styles.validateText}>Valider ma réponse</Text>
            </>}
          </TouchableOpacity>
        ) : currentIdx < totalBlocks - 1 ? (
          <TouchableOpacity style={[styles.validateButton, styles.nextButton]} onPress={goToNext}>
            <Text style={styles.validateText}>Question suivante</Text>
            <Ionicons name="arrow-forward" size={22} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.validateButton, styles.submitButton]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <>
              <Ionicons name="flag" size={22} color="#FFF" />
              <Text style={styles.validateText}>Terminer la mission</Text>
            </>}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={resultModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.resultEmoji}>{(result?.percentage || 0) >= 80 ? '🏆' : (result?.percentage || 0) >= 50 ? '⭐' : '💪'}</Text>
            <Text style={styles.resultTitle}>Mission terminée !</Text>
            <Text style={[styles.resultScore, { color: (result?.percentage || 0) >= 80 ? '#10b981' : (result?.percentage || 0) >= 50 ? '#f59e0b' : '#ef4444' }]}>
              {result?.percentage || 0}%</Text>
            <Text style={styles.resultDetail}>{result?.score}/{result?.max_score} points — {correctCount}/{totalBlocks} bonnes réponses</Text>
            <View style={styles.resultRewards}>
              <View style={styles.rewardItem}><Ionicons name="star" size={28} color="#f59e0b" /><Text style={styles.rewardValue}>+{result?.xp_earned || 0}</Text><Text style={styles.rewardLabel}>XP</Text></View>
              <View style={styles.rewardItem}><Ionicons name="cash-outline" size={28} color="#fbbf24" /><Text style={styles.rewardValue}>+{result?.gold_earned || 0}</Text><Text style={styles.rewardLabel}>Or</Text></View>
            </View>
            <Text style={styles.resultLevel}>Niveau {result?.new_level || '?'}</Text>
            <TouchableOpacity style={styles.closeModalButton} onPress={handleResultClose}>
              <Ionicons name="arrow-back" size={18} color="#FFF" /><Text style={styles.closeModalButtonText}>Retour aux missions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  catItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#667eea' },
  catItemPicked: { backgroundColor: '#c7d2fe', borderColor: '#4f46e5' },
  catItemText: { fontSize: 13, color: '#4338ca', fontWeight: '600' },
  catEmpty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  pool: { marginTop: 10, padding: 12, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 14, backgroundColor: '#FFF' },
  poolTarget: { borderColor: '#667eea', backgroundColor: '#eef2ff' },
  poolLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  poolItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  poolItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  poolItemPicked: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  poolItemText: { fontSize: 14, color: '#374151' },
  dragGhost: { position: 'absolute', left: 20, right: 20, height: 56, backgroundColor: '#667eea', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10, zIndex: 999 },
  dragGhostText: { fontSize: 14, fontWeight: '700', color: '#FFF', flex: 1 },
});

const imgStyles = StyleSheet.create({
  hint: { fontSize: 14, color: '#374151', marginBottom: 4, lineHeight: 22 },
  subHint: { fontSize: 12, color: '#667eea', fontWeight: '600', marginBottom: 10 },
  container: { position: 'relative', overflow: 'hidden', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  marker: { position: 'absolute', width: 28, height: 28, backgroundColor: '#ef4444', borderRadius: 14, borderWidth: 3, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  markerLabel: { fontSize: 8, fontWeight: '800', color: '#FFF' },
  correctZone: { position: 'absolute', borderWidth: 2, borderColor: '#10b981', borderRadius: 100, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
});

const graphStyles = StyleSheet.create({
  container: {},
  hint: { fontSize: 14, color: '#374151', marginBottom: 4, lineHeight: 22 },
  question: { fontSize: 14, color: '#6b7280', marginBottom: 10, lineHeight: 22, fontStyle: 'italic' },
  webviewWrap: { width: '100%', height: 380, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  webview: { flex: 1, backgroundColor: '#fafbfc' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a4e' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  errorText: { fontSize: 16, color: colors.text },
  progressSection: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  progressText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  progressBar: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#667eea', borderRadius: 4 },
  scoreTracker: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreText: { color: '#10b981', fontSize: 13, fontWeight: '700' },
  xpBadge: { color: '#f59e0b', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4, overflow: 'hidden' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  blockContainer: { backgroundColor: '#FFF', borderRadius: 18, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  blockCorrect: { borderWidth: 3, borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  blockIncorrect: { borderWidth: 3, borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  blockTypeBadge: { backgroundColor: '#eef2ff', color: '#667eea', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', overflow: 'hidden' },
  blockPoints: { fontSize: 13, fontWeight: '700', color: '#f59e0b' },
  blockTitle: { fontSize: 17, fontWeight: '700', color: '#1e1b4b', marginBottom: 16 },
  questionText: { fontSize: 14, color: '#374151', marginBottom: 12, lineHeight: 22 },
  graphExpression: { fontSize: 18, fontWeight: '800', color: '#1e1b4b', marginBottom: 12, fontStyle: 'italic', textAlign: 'center' },
  findExprContainer: { backgroundColor: '#f0f4ff', borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 2, borderColor: '#c7d2fe' },
  findExprLabel: { fontWeight: '600', color: '#4338ca', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  findExprRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  findExprCoeffLabel: { fontWeight: '500', fontSize: 16, color: '#374151' },
  findExprInput: { width: 65, padding: 8, borderWidth: 2, borderColor: '#a5b4fc', borderRadius: 8, fontSize: 16, textAlign: 'center', backgroundColor: '#fff' },
  feedbackBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginTop: 16 },
  feedbackCorrect: { backgroundColor: '#dcfce7', borderWidth: 2, borderColor: '#86efac' },
  feedbackIncorrect: { backgroundColor: '#fef2f2', borderWidth: 2, borderColor: '#fca5a5' },
  feedbackEmoji: { fontSize: 28 },
  feedbackTextWrap: { flex: 1 },
  feedbackText: { fontSize: 15, fontWeight: '700' },
  feedbackPoints: { fontSize: 12, fontWeight: '600', color: '#f59e0b', marginTop: 2 },
  correctAnswerBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  correctAnswerText: { fontSize: 13, fontWeight: '600', color: '#166534', flex: 1 },
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
  confettiOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 },
  confettiPiece: { position: 'absolute', width: 12, height: 12, borderRadius: 3 },
  sadEmoji: { position: 'absolute', fontSize: 32 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  validateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#667eea', borderRadius: 14, paddingVertical: 16, shadowColor: '#667eea', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  nextButton: { backgroundColor: '#10b981' },
  submitButton: { backgroundColor: '#f59e0b' },
  validateText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,12,41,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1e1b4b', borderRadius: 28, padding: 32, width: '88%', alignItems: 'center' },
  resultEmoji: { fontSize: 48, marginBottom: 8 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: '#fbbf24', marginBottom: 8 },
  resultScore: { fontSize: 56, fontWeight: '900', marginVertical: 8 },
  resultDetail: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 },
  resultRewards: { flexDirection: 'row', justifyContent: 'center', gap: 50, marginVertical: 16 },
  rewardItem: { alignItems: 'center' },
  rewardValue: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: 4 },
  rewardLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  resultLevel: { fontSize: 16, fontWeight: '700', color: '#a78bfa', marginBottom: 20 },
  closeModalButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#667eea', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  closeModalButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  undoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#667eea', borderRadius: 12, paddingVertical: 12, marginTop: 12 },
  undoButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
});
