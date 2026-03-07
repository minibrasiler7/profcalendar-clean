import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  FlatList,
  ActivityIndicator,
  TextInput,
  Dimensions,
  Image,
  PanResponder,
  Alert,
} from 'react-native';
import Svg, { Polygon, Circle, Rect, G, Text as SvgText, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import api from '../../api/client';
import colors from '../../theme/colors';
import QuestionRenderer from '../../components/questions/QuestionRenderer';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Socket.IO constants
const SOCKET_URL = 'https://profcalendar-clean.onrender.com';

// Sprite URL helper — use walk frame 0 from movement sprites
const getSpriteUrl = (avatarClass) => {
  return `${SOCKET_URL}/static/img/combat/walk_frames/${avatarClass}_walk_ne_0.png`;
};
const getIsometricSpriteUrl = (avatarClass, direction = 'se', state = 'idle') => {
  return `${SOCKET_URL}/static/img/combat/walk_frames/${avatarClass}_walk_${direction}_0.png`;
};
const getMonsterSpriteUrl = (monsterType, state = 'idle') => {
  return `${SOCKET_URL}/static/img/combat/monsters/${monsterType}_${state}.png`;
};

// Class color mapping
const CLASS_COLORS = {
  guerrier: '#ef4444',
  mage: '#667eea',
  archer: '#10b981',
  guerisseur: '#f59e0b',
};

// Skill icon mapping
const SKILL_ICON_MAP = {
  sword: 'fitness',
  shield: 'shield',
  flash: 'flash',
  flame: 'flame',
  sparkles: 'sparkles',
  heart: 'heart',
  locate: 'locate',
  rainy: 'rainy',
  body: 'body',
  sync: 'sync',
  megaphone: 'megaphone',
  nuclear: 'nuclear',
  snow: 'snow',
  planet: 'planet',
  flask: 'flask',
  warning: 'warning',
  rocket: 'rocket',
  people: 'people',
  water: 'water',
  star: 'star',
  sunny: 'sunny',
};

const getSkillIcon = (iconName) => {
  return SKILL_ICON_MAP[iconName] || 'help-circle';
};

// Compute tiles within attack range (Manhattan distance)
const computeAttackRangeTiles = (playerX, playerY, range, gridWidth, gridHeight) => {
  const tiles = [];
  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      const dist = Math.abs(x - playerX) + Math.abs(y - playerY);
      if (dist <= range && dist > 0) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
};

export default function CombatScreen({ route, navigation }) {
  // IMPORTANT: Convert to Number to avoid strict equality issues with server (int vs string)
  const sessionId = Number(route.params.sessionId);
  const studentId = Number(route.params.studentId);
  const classroomId = route.params.classroomId;

  // State management
  const [combatPhase, setCombatPhase] = useState('waiting');
  const [participants, setParticipants] = useState([]);
  const [monsters, setMonsters] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [combatAnswer, setCombatAnswer] = useState({});
  const [timer, setTimer] = useState(30);
  const [timerAnimation] = useState(new Animated.Value(1));
  const [answering, setAnswering] = useState(false);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [answerResult, setAnswerResult] = useState(null); // null, true, false
  const [availableSkills, setAvailableSkills] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [selectingTarget, setSelectingTarget] = useState(false);
  const [availableTargets, setAvailableTargets] = useState([]);
  const [combatLog, setCombatLog] = useState([]);
  const [playerStats, setPlayerStats] = useState({ hp: 100, maxHp: 100, mana: 50, maxMana: 50 });
  const [result, setResult] = useState(null);
  const [answerProgress, setAnswerProgress] = useState({ answered: 0, total: 0 });

  // Move phase state
  const [moveTiles, setMoveTiles] = useState([]);
  const [hasMoved, setHasMoved] = useState(false);
  const [mapConfig, setMapConfig] = useState(null);
  const [myPosition, setMyPosition] = useState({ x: 0, y: 0 });
  const [targetsInRange, setTargetsInRange] = useState([]);
  const [skillsWithTargets, setSkillsWithTargets] = useState(new Set()); // skill IDs that have at least 1 target in range

  // Attack targeting UI state
  const [attackRangeTiles, setAttackRangeTiles] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState(null);

  // Mini-map pinch-to-zoom state
  const [mapScale, setMapScale] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const mapScaleRef = useRef(1);
  const mapOffsetRef = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(0);
  const mapDoubleTapTimer = useRef(null);

  // Battle animation state (Pokémon-style)
  const [battleAnims, setBattleAnims] = useState([]); // current execute animations
  const [currentAnimIndex, setCurrentAnimIndex] = useState(-1);
  const playerShakeAnim = useRef(new Animated.Value(0)).current;
  const enemyShakeAnim = useRef(new Animated.Value(0)).current;
  const playerFlashAnim = useRef(new Animated.Value(1)).current;
  const enemyFlashAnim = useRef(new Animated.Value(1)).current;
  const damagePopAnim = useRef(new Animated.Value(0)).current;
  const lootPopAnim = useRef(new Animated.Value(0)).current;
  const [battleDamageText, setBattleDamageText] = useState('');
  const [battleLootText, setBattleLootText] = useState('');
  const [battleMessage, setBattleMessage] = useState('');
  const [currentEnemySprite, setCurrentEnemySprite] = useState(null);
  const [currentEnemyName, setCurrentEnemyName] = useState('');
  const [currentEnemyHp, setCurrentEnemyHp] = useState({ hp: 0, max: 0 });

  // Debug log for troubleshooting
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [comboStreak, setComboStreak] = useState(0);
  const addDebug = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setDebugLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
    console.log('[CombatDebug]', msg);
  }, []);

  // Socket reference
  const socketRef = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    addDebug(`Socket init: sessionId=${sessionId}, studentId=${studentId}`);

    // Join combat session
    socketRef.current.emit('combat:student_join', {
      session_id: sessionId,
      student_id: studentId,
    });

    socketRef.current.on('connect', () => {
      addDebug('Socket CONNECTED');
    });
    socketRef.current.on('disconnect', (reason) => {
      addDebug(`Socket DISCONNECTED: ${reason}`);
    });

    // Listen for state updates
    socketRef.current.on('combat:state_update', (state) => {
      addDebug(`STATE_UPDATE phase=${state.phase} round=${state.round} participants=${(state.participants||[]).length} monsters=${(state.monsters||[]).length}`);
      // Don't override execute phase while animations are playing (monster_turn comes via state_update
      // and would replace the Pokémon battle view mid-animation)
      const newPhase = state.phase || 'waiting';
      setCombatPhase(prev => {
        if (prev === 'execute' && (newPhase === 'monster_turn' || newPhase === 'round_end')) {
          return prev; // Keep execute view while animations play
        }
        return newPhase;
      });
      setParticipants(state.participants || []);
      setMonsters(state.all_monsters || state.monsters || []);

      // Store map config
      if (state.map_config) {
        setMapConfig(state.map_config);
      }

      // Update player stats from participants list
      const me = (state.participants || []).find(p => Number(p.student_id) === studentId);
      if (me) {
        addDebug(`ME found: hp=${me.current_hp}/${me.max_hp} moved=${me.has_moved} correct=${me.is_correct} answered=${me.answered} pos=(${me.grid_x},${me.grid_y})`);
        setPlayerStats({
          hp: me.current_hp,
          maxHp: me.max_hp,
          mana: me.current_mana,
          maxMana: me.max_mana,
        });
        setMyPosition({ x: me.grid_x, y: me.grid_y });
        setHasMoved(me.has_moved || false);
        if (me.skills && me.skills.length > 0) {
          setAvailableSkills(me.skills);
        }
      } else {
        addDebug(`ME NOT FOUND in participants! Looking for studentId=${studentId}, ids=[${(state.participants||[]).map(p=>p.student_id).join(',')}]`);
      }
    });

    // Listen for new questions (server sends: {block_id, block_type, title, config, round})
    socketRef.current.on('combat:question', (data) => {
      addDebug(`QUESTION round=${data.round} type=${data.block_type} title="${data.title}"`);
      const config = data.config || {};
      // config.question contains the actual question text, data.title is just the block label
      // Extract question text based on block type
      let questionText = config.question || config.text || '';
      if (!questionText) questionText = data.title || 'Question';
      addDebug(`Question text: "${questionText.substring(0, 60)}" type=${data.block_type} options=${(config.options||[]).length}`);

      setCurrentQuestion({
        block_id: data.block_id,
        block_type: data.block_type,
        title: data.title,
        config: config,
        points: data.points || 10,
      });
      setCombatAnswer({});
      setTimer(30);
      setAnswering(false);
      setAnswerSubmitted(false);
      setAnswerResult(null);
      setCombatPhase('question');
    });

    // Listen for answer results (server sends: {student_id, is_correct})
    socketRef.current.on('combat:answer_result', (data) => {
      addDebug(`ANSWER_RESULT is_correct=${data.is_correct} student_id=${data.student_id}`);
      setAnswerResult(data.is_correct);
      setAnswerSubmitted(true);
      // Update combo streak
      if (data.is_correct) {
        setComboStreak(prev => prev + 1);
      } else {
        setComboStreak(0);
      }
    });

    // Listen for answer progress (server sends: {answered, total, student_id, is_correct})
    socketRef.current.on('combat:answer_progress', (data) => {
      addDebug(`ANSWER_PROGRESS ${data.answered}/${data.total} (student ${data.student_id} correct=${data.is_correct})`);
      setAnswerProgress({ answered: data.answered, total: data.total });
    });

    // Listen for all answered signal → action phase (new flow: move → question → action)
    socketRef.current.on('combat:all_answered', (data) => {
      addDebug(`ALL_ANSWERED → phase=${data.phase}`);
      setCombatPhase(data.phase || 'action');
    });

    // Listen for phase changes
    socketRef.current.on('combat:phase_change', (data) => {
      addDebug(`PHASE_CHANGE → ${data.phase}`);
      setCombatPhase(data.phase);
    });

    // Listen for move tiles response
    socketRef.current.on('combat:move_tiles', (data) => {
      addDebug(`MOVE_TILES received: ${(data.tiles||[]).length} tiles`);
      setMoveTiles(data.tiles || []);
    });

    // Listen for move result (server sends: {student_id, participant_id, from_x, from_y, to_x, to_y})
    socketRef.current.on('combat:move_result', (data) => {
      addDebug(`MOVE_RESULT student=${data.student_id} from=(${data.from_x},${data.from_y}) to=(${data.to_x},${data.to_y})`);
      if (Number(data.student_id) === studentId) {
        setMyPosition({ x: data.to_x, y: data.to_y });
        setHasMoved(true);
        setMoveTiles([]);
        addDebug('→ My move confirmed');
      }
    });

    // Listen for targets in range
    socketRef.current.on('combat:targets_in_range', (data) => {
      addDebug(`TARGETS_IN_RANGE: ${(data.targets||[]).length} targets`);
      setTargetsInRange(data.targets || []);
    });

    // Listen for skills availability (which skills have valid targets)
    socketRef.current.on('combat:skills_availability', (data) => {
      addDebug(`SKILLS_AVAILABILITY: [${(data.available_skills||[]).join(',')}]`);
      setSkillsWithTargets(new Set(data.available_skills || []));
    });

    // Listen for combat execution (server sends: {animations: [...]})
    socketRef.current.on('combat:execute', (data) => {
      addDebug(`EXECUTE: ${(data.animations||[]).length} animations`);
      setCombatPhase('execute');
      const anims = data.animations || [];
      setBattleAnims(anims);
      setCurrentAnimIndex(0); // Start playing from first animation

      // Also build combat log
      const logEntries = anims.map(anim => {
        if (anim.type === 'player_move') {
          return `🏃 ${anim.player_name || 'Joueur'} se déplace`;
        } else if (anim.type === 'monster_move') {
          return `🦶 ${anim.monster_name || 'Monstre'} se déplace`;
        } else if (anim.type === 'attack' || anim.type === 'monster_attack') {
          const killed = anim.killed ? ' 💀 K.O.!' : '';
          const loot = anim.loot ? (anim.loot.type === 'gold' ? ` 🪙+${anim.loot.amount}` : ` 🎁${anim.loot.item_name}`) : '';
          return `⚔️ ${anim.attacker_name} → ${anim.target_name} : ${anim.skill_name} (-${anim.damage})${killed}${loot}`;
        } else if (anim.type === 'heal') {
          return `💚 ${anim.attacker_name} soigne ${anim.target_name} → +${anim.heal} PV`;
        } else if (anim.type === 'defense' || anim.type === 'buff') {
          return `🛡️ ${anim.attacker_name} utilise ${anim.skill_name}`;
        }
        return `${anim.attacker_name || '?'} → ${anim.skill_name || '?'}`;
      }).filter(Boolean);
      setCombatLog(prev => [...prev, ...logEntries]);
    });

    // Listen for round_started (auto-advance sends this)
    socketRef.current.on('combat:round_started', (data) => {
      addDebug(`ROUND_STARTED round=${data.round}`);
      // Reset per-round state
      setHasMoved(false);
      setAnswerSubmitted(false);
      setAnswerResult(null);
      setCurrentQuestion(null);
      setCombatAnswer({});
      setAnswering(false);
      setSelectedSkill(null);
      setSelectingTarget(false);
      setAttackRangeTiles([]);
      setSelectedTargetId(null);
    });

    // Listen for combat finished (server sends: {result: 'victory'/'defeat', rewards: {student_id: {xp, gold, ...}}})
    socketRef.current.on('combat:finished', (data) => {
      addDebug(`FINISHED: ${data.result}`);
      setCombatPhase('finished');
      const myReward = data.rewards ? (data.rewards[String(studentId)] || data.rewards[studentId]) : null;
      setResult({
        victory: data.result === 'victory',
        xp: myReward?.xp || 0,
        gold: myReward?.gold || 0,
        levelUp: myReward?.leveled_up || false,
      });
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [sessionId, studentId]);

  // Timer countdown effect
  useEffect(() => {
    if (combatPhase !== 'question' || timer <= 0) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          // Auto-submit if time runs out
          handleSubmitAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [combatPhase, timer]);

  // Timer animation
  useEffect(() => {
    const timerPercent = timer / 30;
    Animated.timing(timerAnimation, {
      toValue: timerPercent,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [timer, timerAnimation]);

  // ── Pokémon-style battle animation playback ──
  useEffect(() => {
    if (currentAnimIndex < 0 || currentAnimIndex >= battleAnims.length) return;

    const anim = battleAnims[currentAnimIndex];
    const isPlayerAttacking = anim.type === 'attack';
    const isMonsterAttacking = anim.type === 'monster_attack';
    const isHeal = anim.type === 'heal';

    // Skip non-combat animations quickly
    if (anim.type === 'player_move' || anim.type === 'monster_move' || anim.type === 'buff' || anim.type === 'defense') {
      setBattleMessage(
        anim.type === 'player_move' ? `${anim.player_name || 'Joueur'} se déplace !` :
        anim.type === 'monster_move' ? `${anim.monster_name || 'Monstre'} se déplace !` :
        `${anim.attacker_name || '?'} utilise ${anim.skill_name || '?'} !`
      );
      const skipTimer = setTimeout(() => {
        setCurrentAnimIndex(prev => prev + 1);
      }, 800);
      return () => clearTimeout(skipTimer);
    }

    // Set enemy sprite for attack animations
    if (isPlayerAttacking && anim.target_type === 'monster') {
      const monsterData = monsters.find(m => m.id === anim.target_id);
      if (monsterData) {
        setCurrentEnemySprite(getMonsterSpriteUrl(monsterData.monster_type, 'idle'));
        setCurrentEnemyName(anim.target_name || monsterData.name);
        setCurrentEnemyHp({ hp: anim.target_hp || 0, max: anim.target_max_hp || 1 });
      }
    } else if (isMonsterAttacking) {
      const monsterData = monsters.find(m => m.id === anim.attacker_id);
      if (monsterData) {
        setCurrentEnemySprite(getMonsterSpriteUrl(monsterData.monster_type, 'idle'));
        setCurrentEnemyName(anim.attacker_name || monsterData.name);
      }
    }

    // Build message
    if (isPlayerAttacking) {
      setBattleMessage(`${anim.attacker_name} utilise ${anim.skill_name} !`);
    } else if (isMonsterAttacking) {
      setBattleMessage(`${anim.attacker_name} attaque ${anim.target_name} !`);
    } else if (isHeal) {
      setBattleMessage(`${anim.attacker_name} soigne ${anim.target_name} !`);
    }

    // Play animation sequence
    const sequence = [];
    setBattleDamageText('');
    setBattleLootText('');
    damagePopAnim.setValue(0);
    lootPopAnim.setValue(0);

    // Step 1: Show message (500ms delay)
    // Step 2: Shake the target (enemy or player)
    const shakeTarget = isMonsterAttacking ? playerShakeAnim : enemyShakeAnim;
    const flashTarget = isMonsterAttacking ? playerFlashAnim : enemyFlashAnim;

    const animTimer = setTimeout(() => {
      // Shake animation
      Animated.sequence([
        Animated.timing(shakeTarget, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeTarget, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeTarget, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeTarget, { toValue: -8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeTarget, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();

      // Flash (blink) animation
      Animated.sequence([
        Animated.timing(flashTarget, { toValue: 0.2, duration: 80, useNativeDriver: true }),
        Animated.timing(flashTarget, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(flashTarget, { toValue: 0.2, duration: 80, useNativeDriver: true }),
        Animated.timing(flashTarget, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]).start();

      // Damage number popup
      const dmgText = isHeal ? `+${anim.heal || 0}` : `-${anim.damage || 0}`;
      setBattleDamageText(anim.critical ? `💥 CRIT! ${dmgText}` : dmgText);
      Animated.sequence([
        Animated.timing(damagePopAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(damagePopAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();

      // Loot popup (if monster killed and has loot)
      if (anim.killed && anim.loot) {
        setTimeout(() => {
          const loot = anim.loot;
          setBattleLootText(
            loot.type === 'gold' ? `🪙 +${loot.amount} or !` : `🎁 ${loot.item_name} (${loot.item_rarity}) !`
          );
          Animated.sequence([
            Animated.timing(lootPopAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(1000),
            Animated.timing(lootPopAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]).start();
        }, 800);
      }

      // Update player HP if they were attacked
      if (isMonsterAttacking && anim.target_hp !== undefined) {
        setPlayerStats(prev => ({
          ...prev,
          hp: Math.max(0, anim.target_hp),
          maxHp: anim.target_max_hp || prev.maxHp,
        }));
      }

      // Next animation after delay
      const nextDelay = (anim.killed && anim.loot) ? 2800 : 1800;
      setTimeout(() => {
        setCurrentAnimIndex(prev => prev + 1);
      }, nextDelay);
    }, 600);

    return () => clearTimeout(animTimer);
  }, [currentAnimIndex, battleAnims]);

  const handleSubmitAnswer = useCallback(() => {
    if (answering || !currentQuestion) return;

    setAnswering(true);

    socketRef.current.emit('combat:submit_answer', {
      session_id: sessionId,
      student_id: studentId,
      answer: combatAnswer,
    });
  }, [sessionId, studentId, combatAnswer, currentQuestion, answering]);

  const handleSelectSkill = (skill) => {
    setSelectedSkill(skill);
    setSelectedTargetId(null); // Reset selected target

    if (skill.type === 'defense' || skill.type === 'buff') {
      // Auto-target self
      handleConfirmAction(null, 'self');
      return;
    }

    // Compute and display attack range tiles
    if (mapConfig && skill.range != null) {
      const tiles = computeAttackRangeTiles(
        myPosition.x,
        myPosition.y,
        skill.range,
        mapConfig.width || 10,
        mapConfig.height || 8
      );
      setAttackRangeTiles(tiles);
    }

    // Request server-validated targets in range
    requestTargets(skill.id);

    // Also build a fallback target list
    if (skill.type === 'heal') {
      const aliveAllies = participants.filter(p => p.is_alive);
      setAvailableTargets(aliveAllies.map(p => ({
        id: p.id,
        name: p.student_name,
        current_hp: p.current_hp,
        max_hp: p.max_hp,
        target_type: 'player',
        in_range: true,
      })));
    } else {
      const aliveMonsters = monsters.filter(m => m.is_alive);
      setAvailableTargets(aliveMonsters.map(m => ({
        id: m.id,
        name: m.name,
        current_hp: m.current_hp,
        max_hp: m.max_hp,
        target_type: 'monster',
        in_range: true,
      })));
    }
    setSelectingTarget(true);
  };

  // Update available targets when server responds with range info
  useEffect(() => {
    if (targetsInRange.length > 0 && selectingTarget) {
      // Use server-provided targets directly (already flattened with in_range + target_type)
      setAvailableTargets(targetsInRange);
    }
  }, [targetsInRange, selectingTarget]);

  const handleConfirmAction = (targetId, targetType) => {
    if (!selectedSkill && !targetType) return;

    const skillToUse = selectedSkill;
    const tType = targetType || (availableTargets.find(t => t.id === targetId)?.target_type) || 'monster';

    socketRef.current.emit('combat:submit_action', {
      session_id: sessionId,
      student_id: studentId,
      skill_id: skillToUse?.id || selectedSkill?.id,
      target_id: targetId,
      target_type: tType,
      combo_streak: comboStreak,
    });

    setSelectedSkill(null);
    setSelectingTarget(false);
    setAttackRangeTiles([]);
    setSelectedTargetId(null);
    setCombatPhase('execute');
  };

  const handleReturnHome = () => {
    navigation.goBack();
  };

  // ── Move phase handlers ──

  const requestMoveTiles = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('combat:request_move_tiles', {
        session_id: sessionId,
        student_id: studentId,
      });
    }
  }, [sessionId, studentId]);

  const handleMoveTo = useCallback((tx, ty) => {
    if (socketRef.current && !hasMoved) {
      socketRef.current.emit('combat:move', {
        session_id: sessionId,
        student_id: studentId,
        target_x: tx,
        target_y: ty,
      });
    }
  }, [sessionId, studentId, hasMoved]);

  const handleSkipMove = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('combat:skip_move', {
        session_id: sessionId,
        student_id: studentId,
      });
      setHasMoved(true);
      setMoveTiles([]);
    }
  }, [sessionId, studentId]);

  const requestTargets = useCallback((skillId) => {
    if (socketRef.current) {
      socketRef.current.emit('combat:request_targets', {
        session_id: sessionId,
        student_id: studentId,
        skill_id: skillId,
      });
    }
  }, [sessionId, studentId]);

  // Request move tiles when entering move phase (move is now first, before question)
  useEffect(() => {
    if (combatPhase === 'move' && !hasMoved) {
      requestMoveTiles();
    }
  }, [combatPhase, hasMoved, requestMoveTiles]);

  // Request skills availability when entering action phase
  useEffect(() => {
    if (combatPhase === 'action' && answerResult === true && socketRef.current) {
      socketRef.current.emit('combat:request_skills_availability', {
        session_id: sessionId,
        student_id: studentId,
      });
    }
  }, [combatPhase, answerResult, sessionId, studentId]);

  // ── Mini-map isometric component (larger + pinch-to-zoom) ──

  const IsoMiniMap = ({ mapHeight = 280, interactive = false, attackTiles = [], selectedTargetId = null, onMonsterTap = null }) => {
    if (!mapConfig) return null;

    // Create PanResponder for pinch-to-zoom and drag
    const mapPanResponder = useRef(PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          const t = evt.nativeEvent.touches;
          lastPinchDist.current = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length === 2) {
          // Pinch zoom
          const t = evt.nativeEvent.touches;
          const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          if (lastPinchDist.current > 0) {
            const scaleDelta = dist / lastPinchDist.current;
            const newScale = Math.max(0.5, Math.min(3.0, mapScaleRef.current * scaleDelta));
            mapScaleRef.current = newScale;
            setMapScale(newScale);
          }
          lastPinchDist.current = dist;
        } else if (evt.nativeEvent.touches.length === 1) {
          // Single finger pan
          const newOffset = {
            x: mapOffsetRef.current.x + gestureState.dx * 0.5,
            y: mapOffsetRef.current.y + gestureState.dy * 0.5,
          };
          mapOffsetRef.current = newOffset;
          setMapOffset(newOffset);
        }
      },
      onPanResponderRelease: () => {
        lastPinchDist.current = 0;
      },
    })).current;

    const gw = mapConfig.width || 10;
    const gh = mapConfig.height || 8;

    // Calculate tile size to fill the available width nicely
    const availableWidth = SCREEN_WIDTH - 32;
    // For isometric, the total width spans (gw + gh) * tileW/2
    const tileW = Math.max(28, Math.min(44, availableWidth / (gw + gh) * 1.8));
    const tileH = tileW / 2;

    // SVG viewBox dimensions
    const svgW = (gw + gh) * (tileW / 2) + tileW;
    const svgH = (gw + gh) * (tileH / 2) + tileH + 20;
    const oxMap = svgW / 2;
    const oyMap = tileH;

    const gridToMini = (gx, gy) => ({
      x: (gx - gy) * (tileW / 2) + oxMap,
      y: (gx + gy) * (tileH / 2) + oyMap,
    });

    // Build obstacle set
    const obstacleSet = new Set();
    (mapConfig.obstacles || []).forEach(o => obstacleSet.add(`${o.x}_${o.y}`));

    // Build move tile set
    const moveTileSet = new Set();
    moveTiles.forEach(t => {
      const tx = t.x !== undefined ? t.x : t[0];
      const ty = t.y !== undefined ? t.y : t[1];
      moveTileSet.add(`${tx}_${ty}`);
    });

    // Build attack range tile set
    const attackTileSet = new Set();
    attackTiles.forEach(t => {
      const tx = t.x !== undefined ? t.x : t[0];
      const ty = t.y !== undefined ? t.y : t[1];
      attackTileSet.add(`${tx}_${ty}`);
    });

    const tileElements = [];
    for (let gy2 = 0; gy2 < gh; gy2++) {
      for (let gx2 = 0; gx2 < gw; gx2++) {
        const { x, y } = gridToMini(gx2, gy2);
        const key = `${gx2}_${gy2}`;
        const isObs = obstacleSet.has(key);
        const isMovable = moveTileSet.has(key);
        const isAttackRange = attackTileSet.has(key);
        const isMyPos = gx2 === myPosition.x && gy2 === myPosition.y;

        let fill = '#4a7c59'; // grass
        if (isObs) fill = '#3a5a8c'; // water/wall
        if (isMovable) fill = 'rgba(59, 130, 246, 0.6)'; // blue highlight for movement
        if (isAttackRange) fill = 'rgba(239, 108, 68, 0.5)'; // red/orange for attack range (default)
        if (isMyPos && !isMovable) fill = '#f59e0b'; // gold for current position

        const hw = tileW / 2;
        const hh = tileH / 2;
        const points = `${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`;

        tileElements.push(
          <Polygon
            key={`tile_${key}`}
            points={points}
            fill={fill}
            stroke={isMovable ? '#60a5fa' : isMyPos ? '#ffd700' : '#2d5a3d'}
            strokeWidth={isMovable ? 2 : isMyPos ? 2 : 0.5}
            onPress={interactive && isMovable ? () => handleMoveTo(gx2, gy2) : undefined}
          />
        );
      }
    }

    // Draw entities
    const entityElements = [];

    // Players - colored circles with class initial
    (participants || []).forEach(p => {
      if (!p.is_alive) return;
      const { x, y } = gridToMini(p.grid_x, p.grid_y);
      const isMe = Number(p.student_id) === studentId;
      const clsColor = CLASS_COLORS[p.avatar_class] || '#ffffff';
      const radius = isMe ? 8 : 6;
      const isSelected = selectedTargetId === p.id && !isMe;

      entityElements.push(
        <G key={`player_${p.student_id}`}>
          {/* Pulsing highlight circle for selected target */}
          {isSelected && (
            <Circle
              cx={x}
              cy={y - 4}
              r={radius + 3}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={2}
              opacity={0.8}
            />
          )}
          <Circle
            cx={x}
            cy={y - 4}
            r={radius}
            fill={isSelected ? '#fbbf24' : clsColor}
            stroke={isSelected ? '#f59e0b' : (isMe ? '#ffffff' : '#000')}
            strokeWidth={isSelected ? 2 : (isMe ? 2 : 1)}
          />
          <SvgText
            x={x}
            y={y - 1}
            fontSize={isMe ? 9 : 7}
            fill="#fff"
            textAnchor="middle"
            fontWeight="bold"
          >
            {(p.avatar_class || 'G')[0].toUpperCase()}
          </SvgText>
          {isMe && (
            <SvgText
              x={x}
              y={y - 14}
              fontSize={7}
              fill="#ffd700"
              textAnchor="middle"
              fontWeight="bold"
            >
              MOI
            </SvgText>
          )}
        </G>
      );
    });

    // Monsters - red squares with type initial
    (monsters || []).forEach(m => {
      if (!m.is_alive) return;
      const { x, y } = gridToMini(m.grid_x, m.grid_y);
      const size = 12;
      const hpPct = m.current_hp / m.max_hp;
      const isSelected = selectedTargetId === m.id;
      const isInAttackRange = attackTiles.some(t => {
        const tx = t.x !== undefined ? t.x : t[0];
        const ty = t.y !== undefined ? t.y : t[1];
        return tx === m.grid_x && ty === m.grid_y;
      });

      entityElements.push(
        <G key={`mon_${m.id}`} onPress={onMonsterTap && (isInAttackRange || !attackTiles.length) ? () => onMonsterTap(m) : undefined}>
          {/* Pulsing highlight circle for selected target */}
          {isSelected && (
            <Circle
              cx={x}
              cy={y - 4}
              r={size}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={2}
              opacity={0.8}
            />
          )}
          <Rect
            x={x - size / 2}
            y={y - size / 2 - 4}
            width={size}
            height={size}
            fill={isSelected ? '#fbbf24' : '#ef4444'}
            stroke={isSelected ? '#f59e0b' : '#dc2626'}
            strokeWidth={isSelected ? 2 : 1}
            rx={2}
          />
          <SvgText
            x={x}
            y={y + 1}
            fontSize={7}
            fill="#fff"
            textAnchor="middle"
            fontWeight="bold"
          >
            {(m.monster_type || m.name || 'M')[0].toUpperCase()}
          </SvgText>
          {/* Mini HP bar under monster */}
          <Rect x={x - 8} y={y + 5} width={16} height={3} fill="#333" rx={1} />
          <Rect x={x - 8} y={y + 5} width={16 * hpPct} height={3} fill={hpPct > 0.5 ? '#10b981' : '#ef4444'} rx={1} />
        </G>
      );
    });

    return (
      <View
        style={[styles.miniMapContainer, { maxHeight: mapHeight, position: 'relative', overflow: 'hidden' }]}
        {...mapPanResponder.panHandlers}
      >
        <View
          style={{
            transform: [
              { translateX: mapOffset.x },
              { translateY: mapOffset.y },
              { scale: mapScale },
            ],
          }}
        >
          <Svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
            <G>{tileElements}</G>
            <G>{entityElements}</G>
          </Svg>
        </View>
        {/* Zoom indicator badge */}
        <View style={styles.zoomBadge}>
          <Text style={styles.zoomBadgeText}>
            {Math.round(mapScale * 100)}%
          </Text>
        </View>
      </View>
    );
  };

  // Render waiting phase
  const renderWaiting = () => (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.phaseTitle}>En attente du prof...</Text>
        <Text style={styles.phaseSubtitle}>Préparation du combat</Text>
      </View>

      <View style={styles.participantsContainer}>
        <Text style={styles.sectionTitle}>Participants</Text>
        <FlatList
          data={participants}
          keyExtractor={(item) => String(item.student_id)}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.participantItem}>
              <View
                style={[
                  styles.classIndicator,
                  { backgroundColor: CLASS_COLORS[item.avatar_class] || colors.primary },
                ]}
              />
              <Text style={styles.participantName}>{item.student_name}</Text>
              <Text style={styles.participantClass}>{item.avatar_class}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );

  // Render the question block content (matching ExerciseSolveScreen style)
  const handleAnswerChange = (blockId, answerData) => {
    setCombatAnswer(answerData);
  };

  // Render question phase
  const renderQuestion = () => {
    if (!currentQuestion) return null;

    // If answer submitted, show result while waiting
    if (answerSubmitted) {
      return (
        <View style={styles.container}>
          <View style={styles.centerContent}>
            <Text style={{ fontSize: 64, marginBottom: 12 }}>
              {answerResult ? '✅' : '❌'}
            </Text>
            <Text style={styles.phaseTitle}>
              {answerResult ? 'Bonne réponse !' : 'Mauvaise réponse...'}
            </Text>
            <Text style={styles.phaseSubtitle}>
              {answerResult
                ? 'Tu vas pouvoir attaquer !'
                : 'Pas d\'attaque ce tour-ci...'}
            </Text>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
            <Text style={[styles.phaseSubtitle, { marginTop: 8 }]}>
              En attente des autres joueurs ({answerProgress.answered}/{answerProgress.total})
            </Text>
          </View>
        </View>
      );
    }

    // Map current question to QuestionRenderer format
    const block = {
      id: currentQuestion.block_id,
      block_type: currentQuestion.block_type,
      title: currentQuestion.title,
      config_json: currentQuestion.config,
      points: currentQuestion.points || 10,
    };

    return (
      <View style={styles.container}>
        <View style={styles.timerContainer}>
          <Animated.View
            style={[
              styles.timerBar,
              {
                width: timerAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
          <Text style={styles.timerText}>{timer}s</Text>
        </View>

        {/* Combo bar */}
        <View style={styles.comboBarContainer}>
          <View style={styles.comboBarTrack}>
            <View style={[styles.comboBarSegment, comboStreak >= 1 && styles.comboBarSegmentFilled1]} />
            <View style={[styles.comboBarSegment, comboStreak >= 2 && styles.comboBarSegmentFilled2]} />
            <View style={[styles.comboBarSegment, comboStreak >= 3 && styles.comboBarSegmentFilled3]} />
          </View>
          <Text style={[styles.comboMultiplierText,
            comboStreak >= 3 ? styles.comboMultiplierX3 :
            comboStreak >= 2 ? styles.comboMultiplierX2 : null
          ]}>
            {comboStreak >= 3 ? 'x3' : comboStreak >= 2 ? 'x2' : 'x1'}
          </Text>
        </View>

        {/* Block title */}
        {block.title && (
          <Text style={{ color: '#667eea', fontSize: 13, marginBottom: 8, fontWeight: '600' }}>
            {block.title}
          </Text>
        )}

        <ScrollView
          style={styles.questionContainer}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.questionCardWrapper}>
            <QuestionRenderer
              block={block}
              answer={combatAnswer}
              onAnswerChange={handleAnswerChange}
              isLocked={answering}
              feedback={null}
            />
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.submitButton, answering && styles.submitButtonDisabled]}
          onPress={handleSubmitAnswer}
          disabled={answering}
        >
          <Text style={styles.submitButtonText}>
            {answering ? 'En attente...' : 'Valider'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render move phase (move is now FIRST, before question)
  const renderMove = () => {
    if (hasMoved) {
      return (
        <View style={styles.container}>
          <IsoMiniMap attackTiles={[]} selectedTargetId={null} />
          <View style={styles.centerContent}>
            <Ionicons name="checkmark-circle" size={48} color="#10b981" />
            <Text style={styles.phaseTitle}>Déplacement effectué</Text>
            <Text style={styles.phaseSubtitle}>En attente des autres joueurs...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Phase de déplacement</Text>
        <Text style={styles.phaseSubtitle}>Touchez une case bleue pour vous déplacer (glissez pour voir la carte)</Text>
        <IsoMiniMap mapHeight={SCREEN_HEIGHT * 0.5} interactive={true} attackTiles={[]} selectedTargetId={null} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
          <TouchableOpacity style={styles.skipMoveButton} onPress={handleSkipMove}>
            <Ionicons name="close-circle-outline" size={20} color="#f59e0b" />
            <Text style={styles.skipMoveText}>Rester ici</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render action phase
  const renderAction = () => {
    if (answerResult === false) {
      // Incorrect answer phase
      return (
        <View style={styles.container}>
          <View style={styles.centerContent}>
            <Text style={styles.sadEmoji}>😢</Text>
            <Text style={styles.phaseTitle}>Tour passé</Text>
            <Text style={styles.phaseSubtitle}>Tu pourras attaquer au prochain tour!</Text>
            <Text style={styles.encouragement}>Reste concentré!</Text>
          </View>
        </View>
      );
    }

    // Correct answer - show skills or target selection
    if (selectingTarget && selectedSkill) {
      const selectedTarget = availableTargets.find(t => t.id === selectedTargetId);

      return (
        <View style={styles.container}>
          {/* Full-height map with attack targeting */}
          <View style={{ flex: 1, position: 'relative' }}>
            <IsoMiniMap
              mapHeight={SCREEN_HEIGHT * 0.55}
              attackTiles={attackRangeTiles}
              selectedTargetId={selectedTargetId}
              onMonsterTap={(monster) => {
                if (monster.in_range !== false) {
                  setSelectedTargetId(monster.id);
                }
              }}
            />

            {/* Monster info bubble overlay */}
            {selectedTarget && (
              <View style={styles.monsterInfoBubble}>
                <Text style={styles.monsterInfoName}>{selectedTarget.name}</Text>
                <View style={styles.monsterInfoHpBar}>
                  <View
                    style={[
                      styles.monsterInfoHpFill,
                      { width: `${(selectedTarget.current_hp / selectedTarget.max_hp) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.monsterInfoHpText}>
                  {selectedTarget.current_hp}/{selectedTarget.max_hp} PV
                </Text>
                <TouchableOpacity
                  style={styles.monsterInfoAttackBtn}
                  onPress={() => handleConfirmAction(selectedTarget.id, selectedTarget.target_type)}
                >
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={styles.monsterInfoAttackText}>Attaquer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Skill info bar + back button */}
          <View style={styles.attackBottomBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setSelectedTargetId(null);
                setSelectedSkill(null);
                setSelectingTarget(false);
                setAttackRangeTiles([]);
              }}
            >
              <Ionicons name="arrow-back" size={18} color="#f59e0b" />
              <Text style={styles.backButtonText}>Retour</Text>
            </TouchableOpacity>
            <Text style={styles.attackSkillInfo}>
              {selectedSkill.name} — Portée: {selectedSkill.range || '?'}
            </Text>
          </View>
        </View>
      );
    }

    // Show skills with range filtering
    const me = participants.find(p => Number(p.student_id) === studentId);
    const myClass = me?.avatar_class || 'guerrier';

    return (
      <View style={styles.container}>
        <IsoMiniMap mapHeight={180} attackTiles={[]} selectedTargetId={null} />
        <Text style={styles.sectionTitle}>Choisir une compétence</Text>
        <View style={styles.skillsGrid}>
          {availableSkills.map((skill) => {
            const manaCost = skill.cost || 0;
            const hasEnoughMana = playerStats.mana >= manaCost;
            // Check if skill has valid targets (defense/buff always available)
            const isSelfSkill = skill.type === 'defense' || skill.type === 'buff';
            const hasTargets = isSelfSkill || skillsWithTargets.size === 0 || skillsWithTargets.has(skill.id);
            const canUse = hasEnoughMana && hasTargets;

            return (
              <TouchableOpacity
                key={skill.id}
                style={[
                  styles.skillButton,
                  !canUse && styles.skillButtonDisabled,
                ]}
                onPress={() => handleSelectSkill(skill)}
                disabled={!canUse}
              >
                <Ionicons
                  name={getSkillIcon(skill.icon)}
                  size={32}
                  color={canUse ? CLASS_COLORS[myClass] || colors.primary : '#666'}
                />
                <Text style={[styles.skillName, !canUse && styles.skillNameDisabled]}>
                  {skill.name}
                </Text>
                <Text style={[styles.skillCost, !canUse && styles.skillCostDisabled]}>
                  {manaCost > 0 ? `${manaCost} ⚡` : 'Gratuit'}
                </Text>
                {!hasTargets && hasEnoughMana && (
                  <Text style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>
                    Aucune cible
                  </Text>
                )}
                {skill.range != null && (
                  <Text style={{ color: '#667eea', fontSize: 10, marginTop: 2 }}>
                    Portée: {skill.range}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Render execute phase — Pokémon-style battle view
  const renderExecute = () => {
    const me = participants.find(p => p.student_id === studentId);
    const myClass = me?.avatar_class || 'guerrier';
    const myName = me?.student_name || 'Héros';
    const hpPercent = playerStats.maxHp > 0 ? (playerStats.hp / playerStats.maxHp) : 1;
    const hpColor = hpPercent > 0.5 ? '#10b981' : hpPercent > 0.2 ? '#f59e0b' : '#ef4444';
    const enemyHpPercent = currentEnemyHp.max > 0 ? (currentEnemyHp.hp / currentEnemyHp.max) : 1;

    return (
      <View style={styles.container}>
        {/* Battle Arena */}
        <View style={battleStyles.arena}>
          {/* Enemy (top-right) */}
          <View style={battleStyles.enemySection}>
            {/* Enemy info bar */}
            <View style={battleStyles.infoBar}>
              <Text style={battleStyles.entityName}>{currentEnemyName || '???'}</Text>
              <View style={battleStyles.hpBarBg}>
                <View style={[battleStyles.hpBarFill, {
                  width: `${Math.max(0, enemyHpPercent * 100)}%`,
                  backgroundColor: enemyHpPercent > 0.5 ? '#10b981' : enemyHpPercent > 0.2 ? '#f59e0b' : '#ef4444',
                }]} />
              </View>
            </View>
            {/* Enemy sprite */}
            <Animated.View style={{
              transform: [{ translateX: enemyShakeAnim }],
              opacity: enemyFlashAnim,
            }}>
              {currentEnemySprite ? (
                <Image source={{ uri: currentEnemySprite }} style={battleStyles.enemySprite} resizeMode="contain" />
              ) : (
                <View style={[battleStyles.enemySprite, { backgroundColor: '#333', borderRadius: 12 }]}>
                  <Text style={{ fontSize: 40, textAlign: 'center', lineHeight: 90 }}>👾</Text>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Player (bottom-left) */}
          <View style={battleStyles.playerSection}>
            {/* Player sprite */}
            <Animated.View style={{
              transform: [{ translateX: playerShakeAnim }],
              opacity: playerFlashAnim,
            }}>
              <Image
                source={{ uri: getSpriteUrl(myClass) }}
                style={battleStyles.playerSprite}
                resizeMode="contain"
              />
            </Animated.View>
            {/* Player info bar */}
            <View style={battleStyles.infoBar}>
              <Text style={battleStyles.entityName}>{myName}</Text>
              <View style={battleStyles.hpBarBg}>
                <View style={[battleStyles.hpBarFill, { width: `${Math.max(0, hpPercent * 100)}%`, backgroundColor: hpColor }]} />
              </View>
              <Text style={battleStyles.hpText}>{playerStats.hp}/{playerStats.maxHp}</Text>
            </View>
          </View>

          {/* Damage popup */}
          <Animated.View style={[battleStyles.damagePopup, {
            opacity: damagePopAnim,
            transform: [{ scale: damagePopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }],
          }]}>
            <Text style={[battleStyles.damageText, battleDamageText.startsWith('+') && { color: '#10b981' }]}>
              {battleDamageText}
            </Text>
          </Animated.View>

          {/* Loot popup */}
          <Animated.View style={[battleStyles.lootPopup, {
            opacity: lootPopAnim,
            transform: [{
              translateY: lootPopAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
            }],
          }]}>
            <Text style={battleStyles.lootText}>{battleLootText}</Text>
          </Animated.View>
        </View>

        {/* Battle message box */}
        <View style={battleStyles.messageBox}>
          <Text style={battleStyles.messageText}>{battleMessage || 'Exécution des actions...'}</Text>
        </View>

        {/* Combat log (scrollable) */}
        <ScrollView style={battleStyles.logScroll} contentContainerStyle={{ paddingBottom: 8 }}>
          {combatLog.slice(-8).map((entry, index) => (
            <Text key={index} style={battleStyles.logEntry}>{entry}</Text>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Render round end phase
  const renderRoundEnd = () => (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.phaseTitle}>En attente du prochain round...</Text>
      </View>
    </View>
  );

  // Render finished phase
  const renderFinished = () => {
    if (!result) return null;

    return (
      <View style={styles.container}>
        <View style={[styles.centerContent, result.victory && styles.victoryContainer]}>
          <Text style={styles.finishEmoji}>{result.victory ? '🎉' : '💀'}</Text>
          <Text style={[styles.finishTitle, result.victory ? styles.victoryTitle : styles.defeatTitle]}>
            {result.victory ? 'VICTOIRE!' : 'DÉFAITE...'}
          </Text>

          <View style={styles.resultStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Expérience</Text>
              <Text style={styles.statValue}>+{result.xp} XP</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Or</Text>
              <Text style={styles.statValue}>+{result.gold} 💰</Text>
            </View>
            {result.levelUp && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>⭐ Montée de niveau!</Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.returnButton} onPress={handleReturnHome}>
          <Text style={styles.returnButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render player stats bar
  const renderStatsBar = () => {
    const me = participants.find(p => Number(p.student_id) === studentId);
    const myClass = me?.avatar_class || 'guerrier';

    return (
    <View style={styles.statsBar}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Image
          source={{ uri: getSpriteUrl(myClass) }}
          style={{ width: 40, height: 40, marginRight: 10 }}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: CLASS_COLORS[myClass] || '#fff', fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>
            {myClass}
          </Text>
          <Text style={{ color: '#aaa', fontSize: 11 }}>
            Phase: {combatPhase}
          </Text>
        </View>
      </View>
      <View style={styles.statBarItem}>
        <Text style={styles.statBarLabel}>HP</Text>
        <View style={styles.statBarBackground}>
          <View
            style={[
              styles.statBarFill,
              {
                width: `${(playerStats.hp / playerStats.maxHp) * 100}%`,
                backgroundColor: playerStats.hp > playerStats.maxHp / 2 ? '#10b981' : '#ef4444',
              },
            ]}
          />
        </View>
        <Text style={styles.statBarValue}>
          {playerStats.hp} / {playerStats.maxHp}
        </Text>
      </View>

      <View style={styles.statBarItem}>
        <Text style={styles.statBarLabel}>Mana</Text>
        <View style={styles.statBarBackground}>
          <View
            style={[
              styles.statBarFill,
              {
                width: `${(playerStats.mana / playerStats.maxMana) * 100}%`,
                backgroundColor: '#667eea',
              },
            ]}
          />
        </View>
        <Text style={styles.statBarValue}>
          {playerStats.mana} / {playerStats.maxMana}
        </Text>
      </View>
    </View>
    );
  };

  // Main render
  const renderPhase = () => {
    switch (combatPhase) {
      case 'waiting':
        return renderWaiting();
      case 'question':
        return renderQuestion();
      case 'move':
        return renderMove();
      case 'action':
        return renderAction();
      case 'execute':
        return renderExecute();
      case 'monster_turn':
        // If we still have battle animations playing, show the battle view
        if (battleAnims.length > 0 && currentAnimIndex < battleAnims.length) {
          return renderExecute();
        }
        return renderRoundEnd();
      case 'round_end':
        return renderRoundEnd();
      case 'finished':
        return renderFinished();
      default:
        return renderWaiting();
    }
  };

  // Debug panel renderer
  const renderDebugPanel = () => (
    <View style={styles.debugPanel}>
      <TouchableOpacity
        style={styles.debugToggle}
        onPress={() => setShowDebug(!showDebug)}
      >
        <Text style={styles.debugToggleText}>
          {showDebug ? '▼' : '▲'} DEBUG — phase: {combatPhase} | answerResult: {String(answerResult)} | hasMoved: {String(hasMoved)}
        </Text>
      </TouchableOpacity>
      {showDebug && (
        <ScrollView style={styles.debugLogContainer}>
          {debugLog.map((entry, i) => (
            <Text key={i} style={styles.debugLogEntry}>{entry}</Text>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      {combatPhase !== 'finished' && combatPhase !== 'question' && combatPhase !== 'execute' && renderStatsBar()}
      {renderPhase()}
      {renderDebugPanel()}
    </View>
  );
}

// Pokémon-style battle view styles
const battleStyles = StyleSheet.create({
  arena: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    margin: 8,
    padding: 12,
    position: 'relative',
    overflow: 'hidden',
    // Gradient-like background with border
    borderWidth: 2,
    borderColor: '#334155',
  },
  enemySection: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  playerSection: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 'auto',
  },
  infoBar: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 10,
    padding: 8,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#475569',
  },
  entityName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  hpBarBg: {
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  hpText: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'right',
  },
  enemySprite: {
    width: 96,
    height: 96,
    marginRight: 20,
    marginTop: 4,
  },
  playerSprite: {
    width: 96,
    height: 96,
    marginLeft: 20,
    marginRight: 12,
    transform: [{ scaleX: -1 }], // Face right
  },
  damagePopup: {
    position: 'absolute',
    top: '40%',
    left: '30%',
    right: '30%',
    alignItems: 'center',
  },
  damageText: {
    color: '#ef4444',
    fontSize: 28,
    fontWeight: '900',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  lootPopup: {
    position: 'absolute',
    bottom: '25%',
    left: '15%',
    right: '15%',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  lootText: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginHorizontal: 8,
    marginTop: 8,
    padding: 14,
    borderWidth: 2,
    borderColor: '#475569',
  },
  messageText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  logScroll: {
    maxHeight: 100,
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  logEntry: {
    color: '#94a3b8',
    fontSize: 11,
    paddingVertical: 2,
  },
});

// Combat question-specific styles (matching ExerciseSolveScreen look)
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  victoryContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  statsBar: {
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  statBarItem: {
    marginVertical: 8,
  },
  statBarLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  statBarBackground: {
    height: 16,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  statBarFill: {
    height: '100%',
    borderRadius: 8,
  },
  statBarValue: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'right',
  },
  timerContainer: {
    height: 40,
    backgroundColor: '#16213e',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  timerText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
    zIndex: 1,
  },
  questionContainer: {
    flex: 1,
    marginBottom: 16,
  },
  questionCardWrapper: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  questionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    lineHeight: 26,
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  optionButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  answerInput: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#0f3460',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  participantsContainer: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  classIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  participantName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  participantClass: {
    color: '#aaa',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  phaseTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginVertical: 12,
  },
  phaseSubtitle: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 8,
  },
  sadEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  encouragement: {
    color: '#f59e0b',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '600',
  },
  skillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  skillButton: {
    width: '48%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  skillButtonDisabled: {
    opacity: 0.4,
  },
  skillName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  skillNameDisabled: {
    color: '#666',
  },
  skillCost: {
    color: '#667eea',
    fontSize: 12,
    marginTop: 4,
  },
  skillCostDisabled: {
    color: '#444',
  },
  targetButton: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  targetName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  targetHpBar: {
    height: 20,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  targetHpFill: {
    height: '100%',
    backgroundColor: '#10b981',
  },
  targetHpText: {
    color: '#aaa',
    fontSize: 12,
  },
  // New target selection UI styles
  targetSelectionHeader: {
    paddingHorizontal: 0,
    paddingVertical: 8,
    marginBottom: 8,
  },
  skillRangeText: {
    color: '#667eea',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  targetListContainer: {
    flex: 1,
    marginVertical: 12,
  },
  targetSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  targetSelectButtonSelected: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#667eea',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#fbbf24',
    backgroundColor: '#fbbf24',
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  targetInfo: {
    flex: 1,
  },
  targetSelectName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  outOfRangeLabel: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '500',
  },
  selectedTargetDetails: {
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginTop: 12,
  },
  targetDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  detailLabel: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },
  backButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 11,
    gap: 8,
  },
  backButtonText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 11,
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  combatLogContainer: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  logEntry: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  logText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  finishEmoji: {
    fontSize: 80,
    marginBottom: 12,
  },
  finishTitle: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 24,
  },
  victoryTitle: {
    color: '#10b981',
  },
  defeatTitle: {
    color: '#ef4444',
  },
  resultStats: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  statItem: {
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
    alignItems: 'center',
  },
  statLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  returnButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  returnButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Mini-map styles
  miniMapContainer: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a4a8a',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 10,
  },
  zoomBadgeText: {
    color: '#fff',
    fontSize: 10,
  },
  // Monster info bubble
  monsterInfoBubble: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#fbbf24',
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100,
  },
  monsterInfoName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  monsterInfoHpBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  monsterInfoHpFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 4,
  },
  monsterInfoHpText: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'right',
    marginBottom: 10,
  },
  monsterInfoAttackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  monsterInfoAttackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  attackBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  attackSkillInfo: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Move phase styles
  skipMoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
    gap: 8,
  },
  skipMoveText: {
    color: '#f59e0b',
    fontWeight: '600',
    fontSize: 14,
  },
  // Target out of range
  targetOutOfRange: {
    opacity: 0.4,
    borderColor: '#333',
  },
  // Debug panel styles
  debugPanel: {
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  debugToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#111',
  },
  debugToggleText: {
    color: '#0f0',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  debugLogContainer: {
    maxHeight: 200,
    paddingHorizontal: 8,
  },
  debugLogEntry: {
    color: '#0f0',
    fontSize: 9,
    fontFamily: 'monospace',
    paddingVertical: 1,
  },
  // Combo bar styles
  comboBarContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 8 },
  comboBarTrack: { flex: 1, flexDirection: 'row', height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden', gap: 2 },
  comboBarSegment: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3 },
  comboBarSegmentFilled1: { backgroundColor: '#667eea' },
  comboBarSegmentFilled2: { backgroundColor: '#f59e0b' },
  comboBarSegmentFilled3: { backgroundColor: '#ef4444' },
  comboMultiplierText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '800', marginLeft: 8, minWidth: 22, textAlign: 'center' },
  comboMultiplierX2: { color: '#f59e0b' },
  comboMultiplierX3: { color: '#ef4444' },
});
