/**
 * WorkoutsHome — muscle-map hero layout.
 *
 * Structure:
 *   1. Personalization CTA (only if workout preferences are incomplete).
 *   2. Compact week strip — 7 chips, today marked, tap to switch focus.
 *   3. MUSCLE MAP HERO — anatomical body diagram is the visual centerpiece.
 *      Front/back toggle. Primary muscles glow fire orange, secondary tint
 *      ochre. Header of the hero card carries day name + workout label +
 *      intensity + logged badge.
 *   4. Exercise list below the map — condensed, checkbox + weight input.
 *   5. Log workout CTA.
 *   6. Small "Refresh plan" pill at the bottom.
 *
 * Palette matches FuelHome + Onboarding.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dumbbell, Plus, Check, RotateCcw, Zap, ChevronRight, Trash2, Sparkles,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { GET_MUSCLE_ACTIVATION } from '../constants';
import { MuscleMapHero } from './MuscleMapHero';

// ──────────────────── Palette ────────────────────
const C = {
  bg: '#161210',
  card: '#1d1815',
  cardSoft: '#221d19',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',
  ochre: '#e8a85a',
  emerald: '#7ab896',
  sky: '#6fa8c4',
  protein: '#e3614a',
  amber: '#d4a55a',
};

interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  weight?: number;
  completed?: boolean;
}

interface WorkoutDay {
  day: string;           // e.g. 'Monday'
  label: string;         // e.g. 'Upper A'
  intensity: string;     // e.g. 'Heavy'
  exercises: WorkoutExercise[];
}

interface WorkoutsHomeProps {
  workoutSplit: WorkoutDay[];
  weeklyCompletedWorkouts: string[];
  currentDayName: string;
  profile?: UserProfile | null;
  isGeneratingSplit: boolean;
  onToggleExerciseComplete: (dayIndex: number, exerciseIndex: number) => void;
  onUpdateExerciseWeight: (dayIndex: number, exerciseIndex: number, weight: string) => void;
  onDeleteExercise: (dayIndex: number, exerciseIndex: number) => void;
  onAddExercise: (dayIndex: number, exercise: { name: string; sets: number; reps: string }) => void;
  onCompleteWorkoutDay: (dayIndex: number) => void;
  onRegenerateSplit: () => void;
  onOpenPersonalize: () => void;
}

export const WorkoutsHome: React.FC<WorkoutsHomeProps> = ({
  workoutSplit,
  weeklyCompletedWorkouts,
  currentDayName,
  profile,
  isGeneratingSplit,
  onToggleExerciseComplete,
  onUpdateExerciseWeight,
  onDeleteExercise,
  onAddExercise,
  onCompleteWorkoutDay,
  onRegenerateSplit,
  onOpenPersonalize,
}) => {
  const todayIndex = useMemo(() => {
    const i = workoutSplit.findIndex(d => d.day.toLowerCase() === currentDayName.toLowerCase());
    return i >= 0 ? i : 0;
  }, [workoutSplit, currentDayName]);

  const [selectedIndex, setSelectedIndex] = useState<number>(todayIndex);

  useEffect(() => {
    setSelectedIndex(todayIndex);
  }, [todayIndex]);

  const [addingExercise, setAddingExercise] = useState(false);
  const [exerciseDraft, setExerciseDraft] = useState({ name: '', sets: 3, reps: '10' });

  useEffect(() => {
    setAddingExercise(false);
    setExerciseDraft({ name: '', sets: 3, reps: '10' });
  }, [selectedIndex]);

  const selectedDay = workoutSplit[selectedIndex];
  const selectedIsCompleted = selectedDay ? weeklyCompletedWorkouts.includes(selectedDay.day) : false;

  // Activation for the muscle map — recomputed when the day changes.
  const activation = useMemo(
    () => GET_MUSCLE_ACTIVATION(selectedDay?.label || ''),
    [selectedDay?.label],
  );

  const showPersonalizeCTA = useMemo(() => {
    const prefs = profile?.workoutPreferences;
    return !(prefs && prefs.experience && prefs.daysPerWeek && prefs.sessionMinutes && prefs.equipment);
  }, [profile]);

  return (
    <div className="pb-20 -mx-4 px-4 animate-fade-in" style={{ background: C.bg, color: C.ink }}>
      {/* ─────── Personalization CTA (only if incomplete) ─────── */}
      {showPersonalizeCTA && (
        <button
          onClick={onOpenPersonalize}
          className="w-full text-left rounded-2xl p-4 mt-1 mb-3 transition-colors active:scale-[0.99]"
          style={{ background: C.card, border: `1px solid ${C.sky}40` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${C.sky}18`, color: C.sky }}>
              <Sparkles className="w-4 h-4" strokeWidth={1.7} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-bold" style={{ color: C.ink }}>Personalize your training</h3>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: C.inkMid }}>
                Tell us your experience, days/week, session length, and equipment. We'll tune the split to you.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.5} style={{ color: C.sky }} />
          </div>
        </button>
      )}

      {/* ─────── Compact week strip ─────── */}
      <div className="pt-1">
        <div className="grid grid-cols-7 gap-1.5">
          {workoutSplit.map((day, i) => {
            const isToday = day.day.toLowerCase() === currentDayName.toLowerCase();
            const isSelected = i === selectedIndex;
            const isCompleted = weeklyCompletedWorkouts.includes(day.day);
            return (
              <button
                key={day.day + i}
                onClick={() => setSelectedIndex(i)}
                className="rounded-xl py-2 px-1 flex flex-col items-center transition-all"
                style={{
                  background: isSelected ? C.card : C.bg,
                  border: `1px solid ${isSelected ? C.fire : C.border}`,
                }}
                aria-label={`View ${day.day}${isToday ? ' (today)' : ''}`}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: isSelected ? C.fire : C.inkLight }}
                >
                  {day.day.slice(0, 3)}
                </span>
                <span
                  className="text-[13px] font-bold tabular-nums mt-0.5"
                  style={{ color: isSelected ? C.ink : C.inkMid }}
                >
                  {day.exercises.length}
                </span>
                <div className="h-1 mt-1 flex items-center justify-center gap-0.5">
                  {isToday && (
                    <span className="w-1 h-1 rounded-full" style={{ background: C.fire }} />
                  )}
                  {isCompleted && (
                    <span className="w-1 h-1 rounded-full" style={{ background: C.emerald }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────── Muscle map hero card ─────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDay?.day || 'empty'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl mt-3 overflow-hidden"
          style={{
            background: C.card,
            border: `1px solid ${selectedIsCompleted ? `${C.emerald}40` : C.border}`,
          }}
        >
          {selectedDay ? (
            <>
              {/* Header — day + label + intensity chip */}
              <div className="px-5 pt-5 pb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
                      {selectedDay.day}
                    </span>
                    {selectedDay.day.toLowerCase() === currentDayName.toLowerCase() && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${C.fire}20`, color: C.fire, border: `1px solid ${C.fire}40` }}>
                        Today
                      </span>
                    )}
                    {selectedIsCompleted && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${C.emerald}20`, color: C.emerald, border: `1px solid ${C.emerald}40` }}>
                        <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
                        Logged
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight mt-1.5 leading-tight truncate" style={{ color: C.ink }}>
                    {selectedDay.label}
                  </h2>
                </div>
                <span
                  className="text-[9px] px-2 py-1 rounded-full font-bold uppercase tracking-widest shrink-0 mt-1"
                  style={{ background: C.bg, color: C.inkMid, border: `1px solid ${C.border}` }}
                >
                  {selectedDay.intensity}
                </span>
              </div>

              {/* THE HERO — big muscle map */}
              <div className="px-4 pt-2 pb-4" data-tour="muscle-hero">
                <MuscleMapHero activation={activation} />
              </div>
            </>
          ) : (
            <p className="text-center text-sm py-16 px-6" style={{ color: C.inkLight }}>
              No workout for this day. Try Refresh plan below.
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ─────── Exercise list card ─────── */}
      {selectedDay && (
        <div
          className="rounded-3xl p-5 mt-3"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-2">
              <Dumbbell className="w-3.5 h-3.5" strokeWidth={1.7} style={{ color: C.inkLight }} />
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
                Exercises
              </span>
            </div>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: C.inkMid }}>
              {selectedDay.exercises.filter(e => e.completed).length} / {selectedDay.exercises.length} done
            </span>
          </div>

          <div className="space-y-2">
            {selectedDay.exercises.map((ex, i) => (
              <ExerciseRow
                key={i}
                exercise={ex}
                onToggle={() => onToggleExerciseComplete(selectedIndex, i)}
                onWeightChange={(w) => onUpdateExerciseWeight(selectedIndex, i, w)}
                onDelete={() => onDeleteExercise(selectedIndex, i)}
                disabled={selectedIsCompleted}
              />
            ))}
            {selectedDay.exercises.length === 0 && (
              <p className="text-center text-[12px] py-4" style={{ color: C.inkLight }}>
                No exercises yet — add one below.
              </p>
            )}
          </div>

          {!selectedIsCompleted && (
            <div className="mt-3">
              {addingExercise ? (
                <div className="rounded-2xl p-3 space-y-2" style={{ background: C.bg, border: `1px solid ${C.borderStrong}` }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Exercise name"
                    value={exerciseDraft.name}
                    onChange={e => setExerciseDraft(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm font-semibold outline-none"
                    style={{ background: C.card, border: `1px solid ${C.border}`, color: C.ink }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Sets"
                        value={exerciseDraft.sets}
                        onChange={e => setExerciseDraft(prev => ({ ...prev, sets: Number(e.target.value) }))}
                        className="flex-1 min-w-0 py-2 bg-transparent text-sm font-semibold outline-none tabular-nums"
                        style={{ color: C.ink }}
                      />
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.inkLight }}>sets</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                      <input
                        type="text"
                        placeholder="Reps"
                        value={exerciseDraft.reps}
                        onChange={e => setExerciseDraft(prev => ({ ...prev, reps: e.target.value }))}
                        className="flex-1 min-w-0 py-2 bg-transparent text-sm font-semibold outline-none"
                        style={{ color: C.ink }}
                      />
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.inkLight }}>reps</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setAddingExercise(false);
                        setExerciseDraft({ name: '', sets: 3, reps: '10' });
                      }}
                      className="flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest"
                      style={{ background: C.card, color: C.inkMid, border: `1px solid ${C.border}` }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!exerciseDraft.name.trim()) return;
                        onAddExercise(selectedIndex, exerciseDraft);
                        setAddingExercise(false);
                        setExerciseDraft({ name: '', sets: 3, reps: '10' });
                      }}
                      disabled={!exerciseDraft.name.trim()}
                      className="flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-40"
                      style={{ background: C.fire }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingExercise(true)}
                  className="w-full py-3 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                  style={{
                    background: 'transparent',
                    border: `1px dashed ${C.borderStrong}`,
                    color: C.inkLight,
                  }}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                  Add exercise
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => onCompleteWorkoutDay(selectedIndex)}
            disabled={selectedIsCompleted || selectedDay.exercises.length === 0}
            className="w-full mt-4 py-4 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: selectedIsCompleted ? C.emerald : C.fire }}
          >
            {selectedIsCompleted ? (
              <>
                <Check className="w-4 h-4" strokeWidth={2.5} />
                Workout logged
              </>
            ) : (
              <>
                <Dumbbell className="w-4 h-4" strokeWidth={2} />
                Log workout
              </>
            )}
          </button>
        </div>
      )}

      {/* ─────── Refresh plan (secondary) ─────── */}
      <div className="flex justify-center mt-6">
        <button
          onClick={onRegenerateSplit}
          disabled={isGeneratingSplit}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
          style={{
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.inkLight,
          }}
        >
          {isGeneratingSplit ? (
            <>
              <motion.div
                className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              Generating...
            </>
          ) : (
            <>
              <RotateCcw className="w-3 h-3" strokeWidth={2} />
              Refresh plan
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ──────────────────── Sub-components ────────────────────

interface ExerciseRowProps {
  exercise: WorkoutExercise;
  onToggle: () => void;
  onWeightChange: (weight: string) => void;
  onDelete: () => void;
  disabled: boolean;
}

const ExerciseRow: React.FC<ExerciseRowProps> = ({ exercise, onToggle, onWeightChange, onDelete, disabled }) => {
  const isDone = !!exercise.completed;
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors"
      style={{
        background: isDone ? `${C.emerald}0d` : C.bg,
        border: `1px solid ${isDone ? `${C.emerald}30` : C.border}`,
      }}
    >
      <button
        onClick={onToggle}
        disabled={disabled}
        className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center transition-colors disabled:opacity-50"
        style={{
          background: isDone ? C.emerald : 'transparent',
          border: `2px solid ${isDone ? C.emerald : C.inkLight}`,
          color: isDone ? '#fff' : 'transparent',
        }}
        aria-label={isDone ? 'Mark not done' : 'Mark done'}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={3} />
      </button>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{
            color: isDone ? C.inkLight : C.ink,
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {exercise.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest tabular-nums"
            style={{ background: `${C.fire}15`, color: C.fire }}
          >
            {exercise.sets}×{exercise.reps}
          </span>
          <div className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <Zap className="w-2.5 h-2.5" strokeWidth={2} style={{ color: C.inkLight }} />
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={exercise.weight || ''}
              onChange={e => onWeightChange(e.target.value)}
              disabled={disabled}
              className="w-10 bg-transparent text-[10px] font-bold outline-none text-center tabular-nums"
              style={{ color: C.ink }}
            />
            <span className="text-[8px] font-bold" style={{ color: C.inkLight }}>lb</span>
          </div>
        </div>
      </div>

      {!disabled && (
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style={{ color: C.inkLight }}
          aria-label="Delete exercise"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.7} />
        </button>
      )}
    </div>
  );
};

export default WorkoutsHome;
