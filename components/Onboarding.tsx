
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhysiqueGoal, ActivityLevel, UserProfile } from '../types';
import {
  DAYS_OF_WEEK,
  CALCULATE_TDEE,
  CALCULATE_MACROS,
  getBMI,
  getBMICategory,
  type BMICategory,
} from '../constants';
import { generateOnboardingMacros } from '../services/geminiService';
import { AlertTriangle, Heart } from 'lucide-react';

interface OnboardingProps {
  onComplete: (profile: UserProfile, targets: any) => void;
}

type Message = {
  id: string;
  role: 'coach' | 'user';
  text: string;
};

const COACH_EMOJI = '⚡';

const QUESTIONS = [
  { id: 'name', text: "Hey! I'm Dings Coach. What's your name?", type: 'text', placeholder: "Your name" },
  { id: 'age', text: "Nice to meet you, {name}! How old are you?", type: 'number', placeholder: "Age" },
  { id: 'sex', text: "Got it. What's your biological sex? (This helps me calculate your metabolism accurately)", type: 'buttons', options: ['Male', 'Female'] },
  { id: 'height', text: "How tall are you? (in inches)", type: 'number', placeholder: "e.g., 70 for 5'10\"" },
  { id: 'weight', text: "What's your current weight in lbs?", type: 'number', placeholder: "Weight" },
  { id: 'bodyFat', text: "Body fat % (optional)?", type: 'number', placeholder: "e.g., 20", allowSkip: true },
  { id: 'goal', text: "What's your main goal right now?", type: 'buttons', options: [PhysiqueGoal.WeightLoss, PhysiqueGoal.Lean, PhysiqueGoal.Bulk, PhysiqueGoal.Recomposition, PhysiqueGoal.Performance] },
  { id: 'activityLevel', text: "How active are you on a typical week?", type: 'buttons', options: Object.values(ActivityLevel) },
  // Workout-personalization questions. These shape the AI-generated split:
  // experience controls exercise complexity, daysPerWeek caps training days,
  // sessionMinutes scales volume, equipment determines the exercise pool.
  { id: 'workoutExperience', text: "How long have you been training consistently?", type: 'buttons', options: ['Beginner', 'Intermediate', 'Advanced'] },
  { id: 'workoutDaysPerWeek', text: "How many days a week can you train?", type: 'buttons', options: ['3 days', '4 days', '5 days', '6 days'] },
  { id: 'workoutSessionMinutes', text: "How long do your sessions usually run?", type: 'buttons', options: ['30 min', '45 min', '60 min', '90 min'] },
  { id: 'workoutEquipment', text: "Where do you train?", type: 'buttons', options: ['Full gym', 'Home with some weights', 'Bodyweight only'] },
  { id: 'highEnergyDays', text: "Which days do you have the most energy for hard training?", type: 'multi-select', options: DAYS_OF_WEEK },
  { id: 'busyDays', text: "Which days are your busiest / hardest to work out?", type: 'multi-select', options: DAYS_OF_WEEK }
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  // Phase gates the chat behind a required health disclaimer.
  // 'disclaimer' → user must tap "I Understand" before the chat starts.
  // 'chat' → normal onboarding flow.
  const [phase, setPhase] = useState<'disclaimer' | 'chat'>('disclaimer');
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: '',
    age: undefined,
    weight: undefined,
    height: undefined,
    sex: undefined,
    bodyFat: undefined,
    activityLevel: undefined,
    goal: undefined,
    highEnergyDays: [],
    busyDays: [],
  });

  const [inputValue, setInputValue] = useState('');
  const [multiSelectValues, setMultiSelectValues] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [macroResult, setMacroResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Health-risk gate: shown after weight (BMI-based) or after goal-selection
  // (weight loss + underweight). Non-blocking — user can dismiss and continue,
  // but they see the warning at least once.
  const [healthWarning, setHealthWarning] = useState<{
    kind: 'lowBmi' | 'highBmi' | 'weightLossWhileUnderweight';
    category: BMICategory;
  } | null>(null);

  const endOfChatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, macroResult]);

  // Initial greeting
  useEffect(() => {
    if (step === 0 && messages.length === 0) {
      addCoachMessage(QUESTIONS[0].text);
    }
  }, []);

  const addCoachMessage = (text: string, delay = 600) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Math.random().toString(), role: 'coach', text }]);
      setIsTyping(false);
    }, delay);
  };

  const addUserMessage = (text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', text }]);
  };

  const handleNextStep = async (value: any, displayValue: string) => {
    const currentQ = QUESTIONS[step];

    // Update form data (keep a local copy too, so BMI checks see the new value)
    const nextFormData = { ...formData, [currentQ.id]: value };
    setFormData(nextFormData);

    // Add user message
    addUserMessage(displayValue);

    setInputValue('');
    setMultiSelectValues([]);
    setErrorMsg('');

    // SAFETY GATE 1: after weight, check BMI. If concerning, surface a
    // non-blocking warning before continuing the chat.
    if (currentQ.id === 'weight' && nextFormData.weight && nextFormData.height) {
      const bmi = getBMI(nextFormData.weight, nextFormData.height);
      const category = getBMICategory(bmi);
      if (category === 'severelyUnderweight' || category === 'underweight') {
        setHealthWarning({ kind: 'lowBmi', category });
      } else if (category === 'severelyObese') {
        setHealthWarning({ kind: 'highBmi', category });
      }
    }

    // SAFETY GATE 2: after goal, warn if user is underweight but picked weight loss.
    if (
      currentQ.id === 'goal' &&
      value === PhysiqueGoal.WeightLoss &&
      nextFormData.weight && nextFormData.height
    ) {
      const bmi = getBMI(nextFormData.weight, nextFormData.height);
      const category = getBMICategory(bmi);
      if (category === 'severelyUnderweight' || category === 'underweight') {
        setHealthWarning({ kind: 'weightLossWhileUnderweight', category });
      }
    }

    const nextStep = step + 1;
    setStep(nextStep);

    if (nextStep < QUESTIONS.length) {
      // Get next question and format it
      const nextQ = QUESTIONS[nextStep];
      let formattedText = nextQ.text.replace('{name}', value || formData.name || 'there');
      
      // Conversational reactions
      if (currentQ.id === 'goal') {
        if (value === PhysiqueGoal.WeightLoss) addCoachMessage("Got it. Fat loss while keeping your muscle — that's the smart play. Let's figure out your exact numbers.", 400);
        else if (value === PhysiqueGoal.Bulk) addCoachMessage("Let's build. We'll set you up in a clean surplus so you're gaining muscle, not just weight.", 400);
        else addCoachMessage("Understood. We will dial in the numbers to match that goal perfectly.", 400);
        addCoachMessage(formattedText, 1500);
      } else if (currentQ.id === 'activityLevel') {
        if (value === ActivityLevel.Very || value === ActivityLevel.Extra) {
          addCoachMessage("Respect. Your body burns more than most — we'll fuel accordingly.", 400);
        } else {
          addCoachMessage("Good to know. We'll factor that into your daily burn.", 400);
        }
        addCoachMessage(formattedText, 1500);
      } else {
        addCoachMessage(formattedText, 600);
      }
    } else {
      // Finished all questions
      setIsTyping(true);
      addCoachMessage("Crunching your numbers...", 400);
      
      const finalData = { ...formData, [currentQ.id]: value } as any;
      try {
        const result = await generateOnboardingMacros(finalData);
        // The proxy clamps to the safety floor, but be defensive: the result
        // shape is `dailyCalories`, not `calories`. Surface floorApplied if set.
        setMacroResult({
          dailyCalories: result.dailyCalories ?? result.calories,
          protein: result.protein,
          carbs: result.carbs,
          fat: result.fat,
          protocolName: result.protocolName,
          coachMessage: result.coachMessage,
          floorApplied: result.floorApplied === true,
          newProfile: finalData,
        });
      } catch (e) {
        console.error("Gemini failed, using local macros:", e);
        // If the user provided body fat (manual entry or InBody), use Katch-McArdle
        // — produces honest targets for users whose weight alone misrepresents their LBM.
        const bf = finalData.inBodyData?.pbf ?? finalData.bodyFat;
        const tdee = CALCULATE_TDEE(
          finalData.weight || 150,
          finalData.height || 70,
          finalData.age || 30,
          finalData.activityLevel || ActivityLevel.Light,
          finalData.sex || 'Male',
          bf,
        );
        const macros = CALCULATE_MACROS(
          tdee,
          finalData.goal || PhysiqueGoal.Lean,
          finalData.weight || 150,
          finalData.sex || 'Male',
        );

        setMacroResult({
          dailyCalories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
          floorApplied: macros.floorApplied,
          newProfile: finalData,
        });
      } finally {
        setIsTyping(false);
      }
    }
  };

  const handleTextSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() && !QUESTIONS[step].allowSkip) return;
    if (!inputValue.trim() && QUESTIONS[step].allowSkip) {
        setErrorMsg('');
        handleNextStep(undefined, 'Skipped');
        return;
    }
    
    setErrorMsg('');
    const currentQ = QUESTIONS[step];
    let val: any = inputValue;
    
    if (currentQ.type === 'number') {
      val = Number(inputValue);
      if (isNaN(val)) return;
      if (currentQ.id === 'age' && (val < 13 || val > 100)) {
         setErrorMsg("Please enter a valid age (13-100)");
         return;
      }
      if (currentQ.id === 'weight' && (val < 80 || val > 500)) {
         setErrorMsg("Please enter your weight in lbs (80-500)");
         return;
      }
      if (currentQ.id === 'height' && (val < 48 || val > 96)) {
         setErrorMsg("Please enter your height in inches (e.g. 71 for 5'11\")");
         return;
      }
      if (currentQ.id === 'bodyFat' && val !== undefined && (val < 3 || val > 60)) {
         setErrorMsg("Body fat should be between 3% and 60%");
         return;
      }
    }
    
    handleNextStep(val, inputValue);
  };

  const handleMultiSelectSubmit = () => {
    handleNextStep(multiSelectValues, multiSelectValues.length > 0 ? multiSelectValues.join(', ') : 'None');
  };

  const handleFinish = () => {
    if (!macroResult) return;
    // Map the conversational onboarding answers ("3 days", "Full gym", etc.)
    // into the typed WorkoutPreferences schema. Falls through gracefully if
    // any answer is missing (existing users re-onboarding might not see the
    // new questions).
    const raw = macroResult.newProfile as any;
    const expRaw = String(raw.workoutExperience || '').toLowerCase();
    const experience: 'beginner' | 'intermediate' | 'advanced' | undefined =
      expRaw === 'beginner' ? 'beginner'
      : expRaw === 'advanced' ? 'advanced'
      : expRaw === 'intermediate' ? 'intermediate'
      : undefined;
    const daysMatch = String(raw.workoutDaysPerWeek || '').match(/(\d+)/);
    const daysPerWeek = daysMatch ? (Number(daysMatch[1]) as 3 | 4 | 5 | 6) : undefined;
    const minutesMatch = String(raw.workoutSessionMinutes || '').match(/(\d+)/);
    const sessionMinutes = minutesMatch ? (Number(minutesMatch[1]) as 30 | 45 | 60 | 90) : undefined;
    const eqRaw = String(raw.workoutEquipment || '').toLowerCase();
    const equipment: 'full-gym' | 'home-weights' | 'bodyweight' | undefined =
      eqRaw.includes('full') || eqRaw.includes('gym') ? 'full-gym'
      : eqRaw.includes('bodyweight') ? 'bodyweight'
      : eqRaw.includes('home') ? 'home-weights'
      : undefined;
    const workoutPreferences = (experience || daysPerWeek || sessionMinutes || equipment)
      ? { experience, daysPerWeek, sessionMinutes, equipment }
      : undefined;

    // Strip the conversational versions of the workout fields from the
    // saved profile — we keep only the typed `workoutPreferences` object.
    const { workoutExperience, workoutDaysPerWeek, workoutSessionMinutes, workoutEquipment, ...cleanProfile } = raw;

    onComplete(
      {
        ...cleanProfile,
        initialWeight: cleanProfile.weight,
        workoutPreferences,
        // Acceptance was captured when the user tapped through the disclaimer
        // phase at the start of onboarding. Persist it so we don't re-prompt.
        acceptedHealthDisclaimer: true,
        disclaimerAcceptedAt: new Date().toISOString(),
      } as UserProfile,
      {
        calories: macroResult.dailyCalories,
        protein: macroResult.protein,
        carbs: macroResult.carbs,
        fat: macroResult.fat,
      }
    );
  };

  const currentQ = step < QUESTIONS.length ? QUESTIONS[step] : null;
  const progressPercent = Math.min(100, Math.round(((step) / QUESTIONS.length) * 100));

  // Disclaimer interstitial: required by Apple Guideline 1.4.1 and Google Play
  // health/medical policy for any app collecting calorie, weight, or macro data.
  // Must be shown before any health-related data is collected.
  if (phase === 'disclaimer') {
    return (
      <div className="fixed inset-0 bg-[#0d0a08] z-[100] flex flex-col font-sans overflow-y-auto">
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="glass-panel border border-white/10 rounded-3xl p-8 space-y-6">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                  <Heart className="w-7 h-7 text-primary" />
                </div>
                <h1 className="text-2xl font-orbitron font-bold text-white tracking-wider text-center">
                  BEFORE WE BEGIN
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest text-center">
                  Quick read — your wellbeing matters
                </p>
              </div>

              <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <p>
                  Dings is a <span className="text-white font-semibold">fitness tracking tool</span>, not
                  a medical device or substitute for professional advice. The calorie targets,
                  workouts, and suggestions you'll see are estimates based on standard formulas
                  — they're a starting point, not a prescription.
                </p>
                <p>
                  Before changing your diet or exercise routine, please talk to your doctor —
                  especially if you have any medical condition, are pregnant or breastfeeding,
                  or take medication.
                </p>
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/5 border border-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-gray-200">
                    If you have or have had an eating disorder, please don't use this app to
                    set goals. Calorie tracking can be unhelpful and harmful in recovery.
                    Consider reaching out to a healthcare provider or the{' '}
                    <a
                      href="https://www.allianceforeatingdisorders.com/find-treatment/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-300 underline underline-offset-2"
                    >
                      National Alliance for Eating Disorders
                    </a>{' '}
                    helpline (1-866-662-1235).
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  By continuing, you confirm you've read the above and understand that Dings
                  doesn't provide medical advice.
                </p>
              </div>

              <button
                onClick={() => setPhase('chat')}
                className="w-full py-4 rounded-2xl bg-white text-black font-orbitron font-bold text-base tracking-widest hover:bg-gray-200 transition-colors"
              >
                I UNDERSTAND & AGREE
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0d0a08] z-[100] flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-xl shadow-md">
          {COACH_EMOJI}
        </div>
        <div className="flex-1">
          <h1 className="text-white font-orbitron font-bold tracking-wider">DINGS COACH</h1>
          <div className="w-full bg-white/10 h-1 rounded-full mt-2 overflow-hidden">
             <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, type: 'spring', damping: 25 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                  ? 'bg-primary text-white rounded-tr-sm' 
                  : 'bg-[#1a1a1a] border border-white/5 text-gray-200 rounded-tl-sm'
                }`}
              >
                <p className="text-[15px] leading-relaxed">{msg.text}</p>
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
               <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl rounded-tl-sm p-4 flex gap-1">
                 <motion.div animate={{y:[0,-5,0]}} transition={{repeat:Infinity, duration:0.6, delay:0}} className="w-2 h-2 rounded-full bg-gray-500" />
                 <motion.div animate={{y:[0,-5,0]}} transition={{repeat:Infinity, duration:0.6, delay:0.2}} className="w-2 h-2 rounded-full bg-gray-500" />
                 <motion.div animate={{y:[0,-5,0]}} transition={{repeat:Infinity, duration:0.6, delay:0.4}} className="w-2 h-2 rounded-full bg-gray-500" />
               </div>
            </motion.div>
          )}

          {macroResult && !isTyping && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5, type: 'spring' }}
              className="mt-8 space-y-6 flex justify-center flex-col items-center w-full"
            >
               <div className="w-full max-w-sm glass-panel border border-white/10 rounded-[2rem] p-6 text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-pink-500/10 pointer-events-none" />
                  
                  <h2 className="text-2xl font-orbitron font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-pink-500 uppercase tracking-widest mb-4">
                     {macroResult.protocolName || "Your daily targets"}
                  </h2>
                  
                  <p className="text-sm text-gray-300 italic mb-6 leading-relaxed relative z-10">"{macroResult.coachMessage}"</p>
                  
                  <div className="grid grid-cols-2 gap-3 relative z-10">
                     <div className="bg-[#0a0a0a] border border-orange-500/20 rounded-2xl p-4 flex flex-col items-center">
                        <span className="text-[10px] text-orange-400 uppercase font-bold tracking-widest mb-1">Calories</span>
                        <span className="text-2xl font-bold text-white">{macroResult.dailyCalories}</span>
                     </div>
                     <div className="bg-[#0a0a0a] border border-green-500/20 rounded-2xl p-4 flex flex-col items-center">
                        <span className="text-[10px] text-green-400 uppercase font-bold tracking-widest mb-1">Protein</span>
                        <span className="text-2xl font-bold text-white">{macroResult.protein}g</span>
                     </div>
                     <div className="bg-[#0a0a0a] border border-blue-500/20 rounded-2xl p-4 flex flex-col items-center">
                        <span className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-1">Carbs</span>
                        <span className="text-2xl font-bold text-white">{macroResult.carbs}g</span>
                     </div>
                     <div className="bg-[#0a0a0a] border border-yellow-500/20 rounded-2xl p-4 flex flex-col items-center">
                        <span className="text-[10px] text-yellow-400 uppercase font-bold tracking-widest mb-1">Fat</span>
                        <span className="text-2xl font-bold text-white">{macroResult.fat}g</span>
                     </div>
                  </div>

                  {/* Floor-applied disclosure — be honest with the user when
                      we've clamped to a safety minimum. */}
                  {macroResult.floorApplied && (
                    <div className="mt-5 flex items-start gap-2 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-left relative z-10">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-200 leading-relaxed">
                        Capped at the safe minimum. Going lower hurts more than it helps.
                      </p>
                    </div>
                  )}
               </div>

               <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                  className="w-full max-w-sm"
               >
                  <p className="text-gray-400 text-center text-sm mb-4">Your daily target. Let's go.</p>
                  <button 
                    onClick={handleFinish}
                    className="w-full py-5 rounded-2xl bg-white text-black font-orbitron font-bold text-lg tracking-widest hover:bg-gray-200 transition-colors shadow-md"
                  >
                    LET'S GO →
                  </button>
               </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endOfChatRef} />
      </div>

      {/* Input Area */}
      {!macroResult && currentQ && !isTyping && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent shrink-0"
        >
          <div className="max-w-md mx-auto">
            {currentQ.type === 'text' || currentQ.type === 'number' ? (
              <div className="flex flex-col gap-2">
                <form onSubmit={handleTextSubmit} className="flex gap-2">
                  <input
                    type={currentQ.type}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={currentQ.placeholder}
                    className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-primary transition-colors text-lg shadow-xl"
                    autoFocus
                  />
                  <button 
                    type="submit" 
                    disabled={!inputValue.trim()}
                    className="bg-primary text-white rounded-2xl px-6 font-bold disabled:opacity-50 transition-opacity flex items-center justify-center shadow-xl"
                  >
                    ↑
                  </button>
                  {currentQ.allowSkip && (
                     <button type="button" onClick={() => handleNextStep(undefined, 'Skipped')} className="bg-white/10 text-white rounded-2xl px-4 text-sm font-bold shadow-xl">
                       Skip
                     </button>
                  )}
                </form>
                {errorMsg && <p className="text-red-500 text-xs ml-2">{errorMsg}</p>}
              </div>
            ) : currentQ.type === 'buttons' ? (
              <div className="flex flex-col gap-2">
                {currentQ.options?.map(opt => (
                  <button
                    key={opt}
                    onClick={() => handleNextStep(opt, opt)}
                    className="w-full bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-white/10 rounded-xl py-4 px-6 text-white text-left font-medium transition-colors shadow-lg"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : currentQ.type === 'multi-select' ? (
              <div className="space-y-4">
                 <div className="flex flex-wrap gap-2">
                   {currentQ.options?.map(opt => {
                     const isSelected = multiSelectValues.includes(opt);
                     return (
                       <button
                         key={opt}
                         onClick={() => {
                           if (isSelected) setMultiSelectValues(prev => prev.filter(v => v !== opt));
                           else setMultiSelectValues(prev => [...prev, opt]);
                         }}
                         className={`px-4 py-3 rounded-xl border font-bold text-sm transition-all flex-1 text-center ${
                           isSelected ? 'bg-primary text-white border-primary shadow-md' : 'bg-[#1a1612] border-white/10 text-gray-400'
                         }`}
                       >
                         {opt.slice(0,3)}
                       </button>
                     );
                   })}
                 </div>
                 <button
                   onClick={handleMultiSelectSubmit}
                   className="w-full bg-white text-black font-bold py-4 rounded-xl uppercase tracking-widest shadow-xl"
                 >
                   Confirm
                 </button>
              </div>
            ) : null}
          </div>
        </motion.div>
      )}

      {/* Health-risk warning modal — shown when BMI is concerning or when the
          user picks weight loss while underweight. Non-blocking: the user can
          continue, but they see the warning at least once. */}
      {healthWarning && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setHealthWarning(null); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm glass-panel border border-amber-500/30 rounded-3xl p-6 space-y-4"
            style={{ background: '#0a0a0a' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-base font-orbitron font-bold text-white tracking-wider">
                A QUICK CHECK-IN
              </h3>
            </div>

            <div className="text-sm text-gray-300 leading-relaxed space-y-3">
              {healthWarning.kind === 'lowBmi' && (
                <>
                  <p>
                    Based on the height and weight you entered, your BMI is on the
                    lower end of the range. We want you to be safe.
                  </p>
                  <p className="text-gray-400">
                    If a doctor hasn't already cleared you to track calories,
                    please consider talking to one before setting a target.
                    Calorie tracking can be unhelpful for people who are
                    underweight or recovering from an eating disorder.
                  </p>
                </>
              )}
              {healthWarning.kind === 'weightLossWhileUnderweight' && (
                <>
                  <p>
                    Your stats suggest you may already be in the underweight
                    range. We'd gently suggest reconsidering a weight-loss goal.
                  </p>
                  <p className="text-gray-400">
                    A Body Recomposition or Performance goal might serve you
                    better — both focus on getting stronger without further
                    weight loss. Worth talking to a doctor before deciding.
                  </p>
                </>
              )}
              {healthWarning.kind === 'highBmi' && (
                <>
                  <p>
                    Based on the height and weight you entered, your BMI is in
                    the severely obese range. We can absolutely help — but at
                    this level, working with a doctor or registered dietitian
                    alongside the app will give you a much safer, more
                    sustainable plan than an app on its own.
                  </p>
                </>
              )}
              <p className="text-[11px] text-gray-500 italic">
                BMI is a rough estimate — it can be off for muscular builds.
                Trust your doctor's judgement over ours.
              </p>
            </div>

            <button
              onClick={() => setHealthWarning(null)}
              className="w-full py-3 rounded-xl bg-white text-black font-bold uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors"
            >
              Got it, continue
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
