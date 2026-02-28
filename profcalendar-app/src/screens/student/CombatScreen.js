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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import api from '../../api/client';
import colors from '../../theme/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Socket.IO constants
const SOCKET_URL = 'https://profcalendar-clean.onrender.com';

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

export default function CombatScreen({ route, navigation }) {
  const { sessionId, studentId, classroomId } = route.params;

  // State management
  const [combatPhase, setCombatPhase] = useState('waiting');
  const [participants, setParticipants] = useState([]);
  const [monsters, setMonsters] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timer, setTimer] = useState(30);
  const [timerAnimation] = useState(new Animated.Value(1));
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedMultiple, setSelectedMultiple] = useState([]);
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

    // Join combat session
    socketRef.current.emit('combat:student_join', {
      session_id: sessionId,
      student_id: studentId,
    });

    // Listen for state updates (server sends: {session_id, status, round, phase, participants, monsters, all_monsters})
    socketRef.current.on('combat:state_update', (state) => {
      console.log('[Combat] state_update:', state.phase, state.round);
      setCombatPhase(state.phase || 'waiting');
      setParticipants(state.participants || []);
      setMonsters(state.all_monsters || state.monsters || []);

      // Update player stats from participants list
      const me = (state.participants || []).find(p => p.student_id === studentId);
      if (me) {
        setPlayerStats({
          hp: me.current_hp,
          maxHp: me.max_hp,
          mana: me.current_mana,
          maxMana: me.max_mana,
        });
        // Update available skills from snapshot
        if (me.skills && me.skills.length > 0) {
          setAvailableSkills(me.skills);
        }
      }
    });

    // Listen for new questions (server sends: {block_id, block_type, title, config, round})
    socketRef.current.on('combat:question', (data) => {
      console.log('[Combat] question received:', data.block_type, data.title);
      const config = data.config || {};
      setCurrentQuestion({
        block_id: data.block_id,
        block_type: data.block_type,
        title: data.title,
        question_text: data.title || config.question || config.text || '',
        options: (config.options || []).map(o => o.text || o.label || o),
        multiple: (config.options || []).filter(o => o.is_correct).length > 1,
        answer_type: config.answer_type,
        config: config,
      });
      setTimer(30);
      setUserAnswer('');
      setSelectedOption(null);
      setSelectedMultiple([]);
      setAnswering(false);
      setAnswerSubmitted(false);
      setAnswerResult(null);
      setCombatPhase('question');
    });

    // Listen for answer results (server sends: {student_id, is_correct})
    socketRef.current.on('combat:answer_result', (data) => {
      console.log('[Combat] answer_result:', data.is_correct);
      setAnswerResult(data.is_correct);
      setAnswerSubmitted(true);
    });

    // Listen for answer progress (server sends: {answered, total, student_id, is_correct})
    socketRef.current.on('combat:answer_progress', (data) => {
      setAnswerProgress({ answered: data.answered, total: data.total });
    });

    // Listen for all answered signal → move to action phase
    socketRef.current.on('combat:all_answered', (data) => {
      console.log('[Combat] all_answered → action phase');
      setCombatPhase('action');
    });

    // Listen for combat execution (server sends: {animations: [...]})
    socketRef.current.on('combat:execute', (data) => {
      console.log('[Combat] execute:', (data.animations || []).length, 'animations');
      setCombatPhase('execute');
      // Convert animations to combat log entries
      const logEntries = (data.animations || []).map(anim => {
        if (anim.type === 'attack' || anim.type === 'monster_attack') {
          const killed = anim.killed ? ' 💀 K.O.!' : '';
          return `⚔️ ${anim.attacker_name} utilise ${anim.skill_name} sur ${anim.target_name} → ${anim.damage} dégâts${killed}`;
        } else if (anim.type === 'heal') {
          return `💚 ${anim.attacker_name} soigne ${anim.target_name} → +${anim.heal} PV`;
        } else if (anim.type === 'defense' || anim.type === 'buff') {
          return `🛡️ ${anim.attacker_name} utilise ${anim.skill_name}`;
        }
        return `${anim.attacker_name} → ${anim.skill_name}`;
      });
      setCombatLog(prev => [...prev, ...logEntries]);

      // Update player HP/Mana from animations
      const myDamage = (data.animations || []).filter(
        a => a.target_type === 'player' && a.target_id && a.type === 'monster_attack'
      );
      // We'll get updated stats from the next state_update
    });

    // Listen for combat finished (server sends: {result: 'victory'/'defeat', rewards: {student_id: {xp, gold, ...}}})
    socketRef.current.on('combat:finished', (data) => {
      console.log('[Combat] finished:', data.result);
      setCombatPhase('finished');
      const myReward = data.rewards ? data.rewards[String(studentId)] : null;
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

  const handleSubmitAnswer = useCallback(() => {
    if (answering || !currentQuestion) return;

    setAnswering(true);

    // Build answer object matching grade_block format
    let answer = {};
    if (currentQuestion.block_type === 'qcm') {
      const sel = currentQuestion.multiple ? selectedMultiple : (selectedOption !== null ? [selectedOption] : []);
      answer = { selected: sel };
    } else if (currentQuestion.block_type === 'short_answer' || currentQuestion.block_type === 'fill_blank') {
      answer = { value: userAnswer };
    } else {
      answer = { value: userAnswer };
    }

    socketRef.current.emit('combat:submit_answer', {
      session_id: sessionId,
      student_id: studentId,
      answer: answer,
    });
  }, [sessionId, studentId, userAnswer, selectedOption, selectedMultiple, currentQuestion, answering]);

  const handleSelectSkill = (skill) => {
    setSelectedSkill(skill);

    // Determine targets based on skill type
    // skill.type: 'attack' → target monsters, 'heal' → target allies, 'defense'/'buff' → self (no target needed)
    if (skill.type === 'heal') {
      // Target alive allies (players)
      const aliveAllies = participants.filter(p => p.is_alive);
      setAvailableTargets(aliveAllies.map(p => ({
        id: p.id,
        name: p.student_name,
        current_hp: p.current_hp,
        max_hp: p.max_hp,
        target_type: 'player',
      })));
      setSelectingTarget(true);
    } else if (skill.type === 'attack') {
      // Target alive monsters
      const aliveMonsters = monsters.filter(m => m.is_alive);
      setAvailableTargets(aliveMonsters.map(m => ({
        id: m.id,
        name: m.name,
        current_hp: m.current_hp,
        max_hp: m.max_hp,
        target_type: 'monster',
      })));
      setSelectingTarget(true);
    } else {
      // Defense/buff — auto-target self, submit immediately
      handleConfirmAction(null, 'self');
    }
  };

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
    });

    setSelectedSkill(null);
    setSelectingTarget(false);
    setCombatPhase('execute');
  };

  const handleReturnHome = () => {
    navigation.goBack();
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

  // Render question phase
  const renderQuestion = () => {
    if (!currentQuestion) return null;

    const isMultiple = currentQuestion.block_type === 'qcm' && currentQuestion.multiple;

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

        <ScrollView style={styles.questionContainer}>
          <Text style={styles.questionText}>{currentQuestion.question_text}</Text>

          {currentQuestion.block_type === 'qcm' && (
            <View style={styles.optionsContainer}>
              {currentQuestion.options?.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionButton,
                    isMultiple
                      ? selectedMultiple.includes(index) && styles.optionButtonSelected
                      : selectedOption === index && styles.optionButtonSelected,
                  ]}
                  onPress={() => {
                    if (isMultiple) {
                      setSelectedMultiple((prev) =>
                        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
                      );
                    } else {
                      setSelectedOption(index);
                    }
                  }}
                  disabled={answering}
                >
                  <View
                    style={[
                      styles.checkbox,
                      (isMultiple
                        ? selectedMultiple.includes(index)
                        : selectedOption === index) && styles.checkboxSelected,
                    ]}
                  >
                    {(isMultiple
                      ? selectedMultiple.includes(index)
                      : selectedOption === index) && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {(currentQuestion.block_type === 'short_answer' ||
            currentQuestion.block_type === 'fill_blank') && (
            <TextInput
              style={styles.answerInput}
              placeholder="Votre réponse..."
              placeholderTextColor="#999"
              value={userAnswer}
              onChangeText={setUserAnswer}
              editable={!answering}
              multiline={currentQuestion.block_type === 'short_answer'}
            />
          )}
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
      return (
        <View style={styles.container}>
          <Text style={styles.sectionTitle}>Choisir une cible</Text>
          <FlatList
            data={availableTargets}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.targetButton}
                onPress={() => handleConfirmAction(item.id, item.target_type)}
              >
                <Text style={styles.targetName}>{item.name}</Text>
                <View style={styles.targetHpBar}>
                  <View
                    style={[
                      styles.targetHpFill,
                      {
                        width: `${(item.current_hp / item.max_hp) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.targetHpText}>
                  {item.current_hp} / {item.max_hp} PV
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      );
    }

    // Show skills
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Choisir une compétence</Text>
        <View style={styles.skillsGrid}>
          {availableSkills.map((skill) => {
            const manaCost = skill.cost || 0;
            const hasEnoughMana = playerStats.mana >= manaCost;
            const me = participants.find(p => p.student_id === studentId);
            const myClass = me?.avatar_class || 'guerrier';
            return (
              <TouchableOpacity
                key={skill.id}
                style={[
                  styles.skillButton,
                  !hasEnoughMana && styles.skillButtonDisabled,
                ]}
                onPress={() => handleSelectSkill(skill)}
                disabled={!hasEnoughMana}
              >
                <Ionicons
                  name={getSkillIcon(skill.icon)}
                  size={32}
                  color={hasEnoughMana ? CLASS_COLORS[myClass] || colors.primary : '#666'}
                />
                <Text style={[styles.skillName, !hasEnoughMana && styles.skillNameDisabled]}>
                  {skill.name}
                </Text>
                <Text style={[styles.skillCost, !hasEnoughMana && styles.skillCostDisabled]}>
                  {manaCost > 0 ? `${manaCost} ⚡` : 'Gratuit'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Render execute phase
  const renderExecute = () => (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>⚔️ Combat</Text>
      <ScrollView style={styles.combatLogContainer}>
        {combatLog.map((entry, index) => (
          <Animated.View
            key={index}
            style={[
              styles.logEntry,
              {
                opacity: new Animated.Value(1),
              },
            ]}
          >
            <Text style={styles.logText}>{entry}</Text>
          </Animated.View>
        ))}
      </ScrollView>
      <Text style={styles.phaseSubtitle}>Exécution des actions...</Text>
    </View>
  );

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
  const renderStatsBar = () => (
    <View style={styles.statsBar}>
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

  // Main render
  const renderPhase = () => {
    switch (combatPhase) {
      case 'waiting':
        return renderWaiting();
      case 'question':
        return renderQuestion();
      case 'action':
        return renderAction();
      case 'execute':
        return renderExecute();
      case 'round_end':
        return renderRoundEnd();
      case 'finished':
        return renderFinished();
      default:
        return renderWaiting();
    }
  };

  return (
    <View style={styles.screen}>
      {combatPhase !== 'finished' && renderStatsBar()}
      {renderPhase()}
    </View>
  );
}

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
});
