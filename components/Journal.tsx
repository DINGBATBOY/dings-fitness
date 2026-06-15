
import React, { useState, useMemo } from 'react';
import { DailyLog, FoodItem, UserProfile, NutritionTargets } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, ChevronLeft, ChevronRight, Utensils, Droplets, Dumbbell, Trash2, Plus, Sparkles, AlertCircle, CheckCircle2, TrendingUp, Loader2, Download } from 'lucide-react';
import { analyzeDailyLog } from '../services/geminiService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Cross-platform PDF save.
 *
 * - Web: jsPDF's built-in `doc.save()` triggers a browser download.
 * - Native (iOS / Android via Capacitor): browser downloads do nothing in
 *   a WebView. We save the PDF as base64 to the Documents directory and
 *   open the system share sheet so the user can save to Files, send via
 *   Mail/Messages, or AirDrop it.
 */
const savePdf = async (doc: jsPDF, filename: string): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename);
    return;
  }
  try {
    // jsPDF returns a data URI; strip the "data:application/pdf;base64," prefix.
    const base64 = doc.output('datauristring').split(',')[1];
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
    });
    await Share.share({
      title: 'Ding! Fitness Report',
      url: result.uri,
      dialogTitle: 'Save or share your report',
    });
  } catch (err) {
    console.error('[Journal] PDF export failed', err);
    // Last-resort fallback: try the browser-style save so the user at least
    // sees something rather than silent failure.
    try { doc.save(filename); } catch { /* swallow */ }
  }
};

interface JournalProps {
  dailyLogs: DailyLog[];
  todayLog: FoodItem[];
  waterIntake: number;
  activityBurn?: number;
  profile: UserProfile;
  targets: NutritionTargets;
  onDeleteLog?: (id: string) => void;
  onAddFood?: () => void;
  /** Optional — opens a small diagnostic panel showing what's actually stored.
   *  When provided, also enables the "Force archive yesterday" recovery button.
   */
  onForceArchive?: () => void;
}

export const Journal: React.FC<JournalProps> = ({
  dailyLogs,
  todayLog,
  waterIntake,
  activityBurn = 0,
  profile,
  targets,
  onDeleteLog,
  onAddFood,
  onForceArchive,
}) => {
  const [showDebug, setShowDebug] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // A "real" archived day is one where the user actually used the app —
  // logged at least one food item OR water OR activity burn. The old
  // rollover code created empty archives every time the user opened the
  // app (even on days they didn't log anything), so dailyLogs can contain
  // dozens of empty placeholders. We exclude them from the navigable list
  // so the user only sees days that actually have something to show.
  const hasRealActivity = (log: DailyLog): boolean =>
    (log.foodItems && log.foodItems.length > 0) ||
    (log.caloriesConsumed || 0) > 0 ||
    (log.waterIntake || 0) > 0 ||
    (log.caloriesBurned || 0) > 0;

  // Combine today's live data with historical logs.
  // Also de-dupes by date in case the rollover ever wrote duplicates.
  const allLogs = useMemo(() => {
    const todayStr = new Date().toLocaleDateString();
    const rawCalories = todayLog.reduce((acc, item) => acc + (item.calories || 0), 0);
    const todayEntry: DailyLog = {
      date: todayStr,
      weight: 0, // Not tracked live here
      caloriesConsumed: Math.max(0, rawCalories - activityBurn),
      proteinConsumed: todayLog.reduce((acc, item) => acc + (item.protein || 0), 0),
      carbsConsumed: todayLog.reduce((acc, item) => acc + (item.carbs || 0), 0),
      fatConsumed: todayLog.reduce((acc, item) => acc + (item.fat || 0), 0),
      fiberConsumed: todayLog.reduce((acc, item) => acc + (item.fiber || 0), 0),
      waterIntake: waterIntake,
      foodItems: todayLog
    };

    // De-dupe by date (keep first occurrence — they're ordered however
    // they arrived from storage), drop empty days, drop any duplicate of today.
    const seen = new Set<string>();
    const history = (dailyLogs || [])
      .filter(log => log.date !== todayStr)
      .filter(log => {
        if (seen.has(log.date)) return false;
        seen.add(log.date);
        return true;
      })
      .filter(hasRealActivity);

    return [todayEntry, ...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dailyLogs, todayLog, waterIntake]);

  // Count of REAL archived days (not the raw dailyLogs length, which is
  // polluted with empties). This is what we surface in the diagnostic.
  const realArchivedCount = useMemo(
    () => allLogs.filter(l => l.date !== new Date().toLocaleDateString()).length,
    [allLogs],
  );

  const currentLog = useMemo(() => {
    return allLogs.find(log => log.date === selectedDate) || null;
  }, [allLogs, selectedDate]);

  // ----- WEEK STRIP DATA -------------------------------------------------
  // Build a continuous 7-day strip ending today, regardless of whether each
  // day has a log. Days with data show calorie progress vs target; empty days
  // are dimmed but still tappable (to confirm there's nothing there).
  const weekStrip = useMemo(() => {
    const days: { date: string; dateLabel: string; dayAbbrev: string; log: DailyLog | null; isToday: boolean; isSelected: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString();
      const dayAbbrev = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
      const log = allLogs.find(l => l.date === dateStr) || null;
      days.push({
        date: dateStr,
        dateLabel: String(d.getDate()),
        dayAbbrev,
        log,
        isToday: i === 0,
        isSelected: dateStr === selectedDate,
      });
    }
    return days;
  }, [allLogs, selectedDate]);

  // ----- WEEKLY SUMMARY (rolling 7 days, only days that have data) -------
  const weeklySummary = useMemo(() => {
    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(todayD);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const inWindow = allLogs.filter(log => {
      const d = new Date(log.date);
      return d >= sevenDaysAgo && d <= todayD;
    });
    // Only count days where the user actually logged food.
    const loggedDays = inWindow.filter(log => (log.caloriesConsumed || 0) > 0 || (log.foodItems && log.foodItems.length > 0));
    if (loggedDays.length === 0) return null;

    const totals = loggedDays.reduce((acc, log) => ({
      calories: acc.calories + (log.caloriesConsumed || 0),
      protein:  acc.protein  + (log.proteinConsumed || 0),
      carbs:    acc.carbs    + (log.carbsConsumed || 0),
      fat:      acc.fat      + (log.fatConsumed || 0),
      water:    acc.water    + (log.waterIntake || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 });

    const days = loggedDays.length;
    return {
      days,
      avgCalories: Math.round(totals.calories / days),
      avgProtein:  Math.round(totals.protein / days),
      avgCarbs:    Math.round(totals.carbs / days),
      avgFat:      Math.round(totals.fat / days),
      avgWater:    Math.round(totals.water / days),
    };
  }, [allLogs]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const currentIndex = allLogs.findIndex(log => log.date === selectedDate);
    if (direction === 'prev' && currentIndex < allLogs.length - 1) {
      setSelectedDate(allLogs[currentIndex + 1].date);
    } else if (direction === 'next' && currentIndex > 0) {
      setSelectedDate(allLogs[currentIndex - 1].date);
    }
  };

  const isToday = selectedDate === new Date().toLocaleDateString();

  const handleAnalyze = async () => {
    if (!currentLog) return;
    
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeDailyLog(currentLog, profile, targets);
      setAnalysis(result);
    } catch (err) {
      console.error("Analysis failed:", err);
      setError("Failed to analyze log. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset analysis when date changes
  useMemo(() => {
    setAnalysis(null);
    setError(null);
  }, [selectedDate]);

  // Shared PDF styling helpers — keep both reports visually consistent and
  // make adding new sections trivial.
  const PDF_COLORS = {
    accent: [249, 115, 22] as [number, number, number],   // orange
    accentDim: [251, 146, 60] as [number, number, number],
    text: [30, 30, 30] as [number, number, number],
    mute: [120, 120, 120] as [number, number, number],
    rule: [220, 220, 220] as [number, number, number],
    panel: [248, 248, 248] as [number, number, number],
    headerBg: [22, 22, 22] as [number, number, number],
    headerText: [255, 255, 255] as [number, number, number],
  };

  const addBrandHeader = (doc: jsPDF, subtitle: string) => {
    // Top bar
    doc.setFillColor(...PDF_COLORS.headerBg);
    doc.rect(0, 0, 210, 18, 'F');
    // Orange accent stripe at the very top
    doc.setFillColor(...PDF_COLORS.accent);
    doc.rect(0, 0, 210, 2, 'F');
    // Brand mark
    doc.setTextColor(...PDF_COLORS.headerText);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DING! FITNESS', 14, 12);
    // Subtitle (right-aligned)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(160, 160, 160);
    doc.text(subtitle, 196, 12, { align: 'right' });
    // Reset
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFont('helvetica', 'normal');
  };

  const addSectionHeader = (doc: jsPDF, text: string, y: number): number => {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(text.toUpperCase(), 14, y);
    // Orange underline matching the text width
    doc.setDrawColor(...PDF_COLORS.accent);
    doc.setLineWidth(1.2);
    doc.line(14, y + 1.5, 14 + doc.getTextWidth(text.toUpperCase()), y + 1.5);
    doc.setFont('helvetica', 'normal');
    doc.setLineWidth(0.2);
    return y + 9;
  };

  const addPageFooter = (doc: jsPDF) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...PDF_COLORS.mute);
      doc.text(
        `Ding! Fitness · This is a fitness tool, not medical advice · Generated ${new Date().toLocaleString()}`,
        105,
        290,
        { align: 'center' },
      );
      doc.text(`Page ${i} of ${pageCount}`, 196, 290, { align: 'right' });
    }
  };

  const handleDownloadMonthlyPDF = async () => {
    const selectedMonth = new Date(selectedDate).getMonth();
    const selectedYear = new Date(selectedDate).getFullYear();
    const monthName = new Date(selectedDate).toLocaleString('default', { month: 'long' });

    // ALL logs in the selected calendar month — both empty and real. We need
    // both for the "logged X of N calendar days" disclosure.
    const calendarDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    const monthlyLogsAll = (dailyLogs || []).filter(log => {
      const logDate = new Date(log.date);
      return logDate.getMonth() === selectedMonth && logDate.getFullYear() === selectedYear;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // REAL logs only — what averages should actually be computed on. Empty
    // placeholder entries (no food, no water, no burn) get excluded so
    // averages reflect days the user actually used the app.
    const monthlyLogs = monthlyLogsAll.filter(hasRealActivity);

    if (monthlyLogs.length === 0) {
      alert("No logged data for this month.");
      return;
    }

    const doc = new jsPDF();
    addBrandHeader(doc, `${monthName} ${selectedYear}`);

    // ----- TITLE BLOCK -----
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_COLORS.text);
    doc.text('Monthly Report', 14, 32);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_COLORS.mute);
    doc.text(`${monthName} ${selectedYear}  ·  Logged ${monthlyLogs.length} of ${calendarDaysInMonth} days`, 14, 38);

    let y = 50;

    // ----- AVERAGES (KEY METRICS) -----
    y = addSectionHeader(doc, 'Daily Averages', y);
    const totalDays = monthlyLogs.length;
    const monthlyTotals = monthlyLogs.reduce((acc, log) => ({
      calories: acc.calories + (log.caloriesConsumed || 0),
      protein:  acc.protein  + (log.proteinConsumed  || 0),
      carbs:    acc.carbs    + (log.carbsConsumed    || 0),
      fat:      acc.fat      + (log.fatConsumed      || 0),
      fiber:    acc.fiber    + (log.fiberConsumed    || 0),
      water:    acc.water    + (log.waterIntake      || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 });

    const avg = (n: number) => Math.round(n / totalDays);

    // 4-column metric panel
    const drawMetric = (x: number, label: string, value: string, sub: string) => {
      doc.setFillColor(...PDF_COLORS.panel);
      doc.roundedRect(x, y - 2, 44, 22, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PDF_COLORS.mute);
      doc.text(label.toUpperCase(), x + 3, y + 3);
      doc.setFontSize(15);
      doc.setTextColor(...PDF_COLORS.text);
      doc.text(value, x + 3, y + 12);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_COLORS.mute);
      doc.text(sub, x + 3, y + 17);
    };
    drawMetric(14, 'Calories', String(avg(monthlyTotals.calories)), 'kcal / day');
    drawMetric(60, 'Protein',  `${avg(monthlyTotals.protein)}g`,    'avg / day');
    drawMetric(106,'Carbs',    `${avg(monthlyTotals.carbs)}g`,      'avg / day');
    drawMetric(152,'Fat',      `${avg(monthlyTotals.fat)}g`,        'avg / day');
    y += 28;
    drawMetric(14, 'Fiber',    `${avg(monthlyTotals.fiber)}g`,      'avg / day');
    drawMetric(60, 'Water',    `${avg(monthlyTotals.water)} oz`,    'avg / day');
    y += 32;

    // ----- BEST DAYS -----
    y = addSectionHeader(doc, 'Standout Days', y);
    const sortBy = <T,>(arr: T[], pick: (x: T) => number) => [...arr].sort((a, b) => pick(b) - pick(a));
    const topProtein = sortBy(monthlyLogs, l => l.proteinConsumed)[0];
    const topFiber   = sortBy(monthlyLogs, l => l.fiberConsumed || 0)[0];
    const topWater   = sortBy(monthlyLogs, l => l.waterIntake)[0];
    const cleanestCalDay = monthlyLogs.reduce((best, l) => {
      const score = Math.abs(l.caloriesConsumed - targets.calories);
      const bestScore = Math.abs(best.caloriesConsumed - targets.calories);
      return score < bestScore ? l : best;
    }, monthlyLogs[0]);

    const standouts: [string, string][] = [
      ['Highest protein', `${new Date(topProtein.date).toLocaleDateString()}  ·  ${Math.round(topProtein.proteinConsumed)}g`],
      ['Closest to calorie target', `${new Date(cleanestCalDay.date).toLocaleDateString()}  ·  ${Math.round(cleanestCalDay.caloriesConsumed)} kcal (target ${targets.calories})`],
      ['Most fiber', `${new Date(topFiber.date).toLocaleDateString()}  ·  ${Math.round(topFiber.fiberConsumed || 0)}g`],
      ['Most water', `${new Date(topWater.date).toLocaleDateString()}  ·  ${Math.round(topWater.waterIntake)} oz`],
    ];
    autoTable(doc, {
      startY: y,
      head: [],
      body: standouts,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: { top: 2, right: 4, bottom: 2, left: 4 } },
      columnStyles: { 0: { fontStyle: 'bold', textColor: PDF_COLORS.text, cellWidth: 60 }, 1: { textColor: PDF_COLORS.mute } },
      didDrawCell: (data) => {
        if (data.column.index === 0 && data.section === 'body') {
          // Small orange dot before each standout label
          doc.setFillColor(...PDF_COLORS.accent);
          doc.circle(data.cell.x - 1, data.cell.y + data.cell.height / 2, 0.9, 'F');
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // ----- WEEKLY BREAKDOWN -----
    y = addSectionHeader(doc, 'Weekly Averages', y);
    const weeks: Record<number, { cal: number; pro: number; carb: number; fat: number; fib: number; cnt: number }> = {};
    monthlyLogs.forEach(log => {
      const date = new Date(log.date);
      const weekNum = Math.ceil(date.getDate() / 7);
      if (!weeks[weekNum]) weeks[weekNum] = { cal: 0, pro: 0, carb: 0, fat: 0, fib: 0, cnt: 0 };
      weeks[weekNum].cal  += log.caloriesConsumed || 0;
      weeks[weekNum].pro  += log.proteinConsumed  || 0;
      weeks[weekNum].carb += log.carbsConsumed    || 0;
      weeks[weekNum].fat  += log.fatConsumed      || 0;
      weeks[weekNum].fib  += log.fiberConsumed    || 0;
      weeks[weekNum].cnt  += 1;
    });
    const weeklyData = Object.keys(weeks).map(weekStr => {
      const w = parseInt(weekStr);
      const d = weeks[w];
      return [
        `Week ${w}`,
        `${d.cnt} day${d.cnt !== 1 ? 's' : ''}`,
        `${Math.round(d.cal / d.cnt)} kcal`,
        `${Math.round(d.pro / d.cnt)}g`,
        `${Math.round(d.carb / d.cnt)}g`,
        `${Math.round(d.fat / d.cnt)}g`,
        `${Math.round(d.fib / d.cnt)}g`,
      ];
    });
    autoTable(doc, {
      startY: y,
      head: [['Week', 'Logged', 'Cal/day', 'Protein', 'Carbs', 'Fat', 'Fiber']],
      body: weeklyData,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: PDF_COLORS.panel },
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // ----- DAILY BREAKDOWN -----
    if (y > 240) { doc.addPage(); y = 20; }
    y = addSectionHeader(doc, 'Daily Breakdown', y);
    const dailyData = monthlyLogs.map(log => [
      new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' }),
      `${Math.round(log.caloriesConsumed || 0)}`,
      `${Math.round(log.proteinConsumed  || 0)}g`,
      `${Math.round(log.carbsConsumed    || 0)}g`,
      `${Math.round(log.fatConsumed      || 0)}g`,
      `${Math.round(log.fiberConsumed    || 0)}g`,
      `${Math.round(log.waterIntake      || 0)} oz`,
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Calories', 'Protein', 'Carbs', 'Fat', 'Fiber', 'Water']],
      body: dailyData,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: PDF_COLORS.panel },
    });

    addPageFooter(doc);
    await savePdf(doc, `Ding-Monthly-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.pdf`);
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF();
    addBrandHeader(doc, selectedDate);

    // ----- TITLE BLOCK -----
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_COLORS.text);
    doc.text('Daily Report', 14, 32);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_COLORS.mute);
    const friendlyDate = new Date(selectedDate).toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    doc.text(friendlyDate, 14, 38);

    let y = 50;

    // ----- NO DATA STATE -----
    if (!currentLog || !hasRealActivity(currentLog)) {
      y = addSectionHeader(doc, 'No Data', y);
      doc.setFontSize(11);
      doc.setTextColor(...PDF_COLORS.mute);
      doc.text('Nothing was logged on this day.', 14, y);
      addPageFooter(doc);
      await savePdf(doc, `Ding-Daily-${selectedDate.replace(/\//g, '-')}.pdf`);
      return;
    }

    // ----- KEY METRICS PANEL -----
    y = addSectionHeader(doc, "Today's Totals", y);
    const drawMetric = (x: number, label: string, value: string, sub: string) => {
      doc.setFillColor(...PDF_COLORS.panel);
      doc.roundedRect(x, y - 2, 44, 22, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PDF_COLORS.mute);
      doc.text(label.toUpperCase(), x + 3, y + 3);
      doc.setFontSize(15);
      doc.setTextColor(...PDF_COLORS.text);
      doc.text(value, x + 3, y + 12);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_COLORS.mute);
      doc.text(sub, x + 3, y + 17);
    };
    drawMetric(14,  'Calories', String(Math.round(currentLog.caloriesConsumed || 0)), `target ${targets.calories} kcal`);
    drawMetric(60,  'Protein',  `${Math.round(currentLog.proteinConsumed || 0)}g`,    `target ${targets.protein}g`);
    drawMetric(106, 'Carbs',    `${Math.round(currentLog.carbsConsumed || 0)}g`,      `target ${targets.carbs}g`);
    drawMetric(152, 'Fat',      `${Math.round(currentLog.fatConsumed || 0)}g`,        `target ${targets.fat}g`);
    y += 28;
    drawMetric(14,  'Fiber',    `${Math.round(currentLog.fiberConsumed || 0)}g`,      '');
    drawMetric(60,  'Water',    `${Math.round(currentLog.waterIntake || 0)} oz`,      '');
    if (currentLog.caloriesBurned) {
      drawMetric(106, 'Burned', `${Math.round(currentLog.caloriesBurned)} kcal`, 'activity');
    }
    y += 32;

    // ----- FOOD LOG TABLE -----
    if (currentLog.foodItems && currentLog.foodItems.length > 0) {
      y = addSectionHeader(doc, `Food Log  ·  ${currentLog.foodItems.length} item${currentLog.foodItems.length !== 1 ? 's' : ''}`, y);
      const foodData = currentLog.foodItems.map(item => [
        item.name,
        `${Math.round(item.calories || 0)}`,
        `${Math.round(item.protein || 0)}g`,
        `${Math.round(item.carbs || 0)}g`,
        `${Math.round(item.fat || 0)}g`,
        `${Math.round(item.fiber || 0)}g`,
      ]);
      autoTable(doc, {
        startY: y,
        head: [['Item', 'Cal', 'Protein', 'Carbs', 'Fat', 'Fiber']],
        body: foodData,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: PDF_COLORS.panel },
        columnStyles: { 0: { cellWidth: 75 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    }

    // ----- LAST 7 DAYS TREND -----
    const todayStr = new Date().toLocaleDateString();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const weeklyLogs = allLogs.filter(l => {
      const d = new Date(l.date);
      return d >= sevenDaysAgo && l.date !== todayStr; // exclude today's live entry to avoid mixing in-progress + closed
    }).filter(hasRealActivity).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (weeklyLogs.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      y = addSectionHeader(doc, 'Last 7 Days', y);
      const weeklyData = weeklyLogs.map(log => [
        new Date(log.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        `${Math.round(log.caloriesConsumed || 0)}`,
        `${Math.round(log.proteinConsumed || 0)}g`,
        `${Math.round(log.carbsConsumed || 0)}g`,
        `${Math.round(log.fatConsumed || 0)}g`,
        `${Math.round(log.waterIntake || 0)} oz`,
      ]);
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Calories', 'Protein', 'Carbs', 'Fat', 'Water']],
        body: weeklyData,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: PDF_COLORS.panel },
      });
    }

    addPageFooter(doc);
    await savePdf(doc, `Ding-Daily-${selectedDate.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* WEEK STRIP — last 7 days, tap any day to jump there. Each cell shows
          the day abbreviation, date number, and a small calorie progress bar
          vs target. Days without data appear dimmed but stay tappable. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last 7 days</h3>
          {/* Diagnostic indicator — shows how many REAL archived days have
              content. Excludes empty placeholders from the legacy rollover
              that fired even when the user didn't log anything. */}
          <span className="text-[10px] text-gray-600 font-mono">
            {realArchivedCount === 0
              ? 'no past days saved'
              : `${realArchivedCount} day${realArchivedCount !== 1 ? 's' : ''} with data`}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekStrip.map(day => {
            const hasData = !!(day.log && (day.log.caloriesConsumed > 0 || (day.log.foodItems && day.log.foodItems.length > 0)));
            const calPct = hasData && targets.calories
              ? Math.min(100, ((day.log!.caloriesConsumed || 0) / targets.calories) * 100)
              : 0;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all ${
                  day.isSelected
                    ? 'bg-orange-500/15 border-orange-500/50 text-white'
                    : hasData
                      ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      : 'bg-white/[0.02] border-white/5 text-gray-600 hover:bg-white/5'
                }`}
              >
                <span className="text-[9px] uppercase font-bold tracking-widest opacity-70">{day.dayAbbrev}</span>
                <span className="text-base font-bold tabular-nums leading-tight">{day.dateLabel}</span>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full ${day.isSelected ? 'bg-orange-400' : 'bg-emerald-400/70'}`}
                    style={{ width: `${calPct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* WEEKLY SUMMARY — averages across days that had data in the last 7. */}
      {weeklySummary && (
        <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Past 7 days · {weeklySummary.days} day{weeklySummary.days !== 1 ? 's' : ''} logged
            </h3>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <div className="text-base font-bold text-white tabular-nums">{weeklySummary.avgCalories}</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">Cal/day</div>
            </div>
            <div>
              <div className="text-base font-bold text-emerald-400 tabular-nums">{weeklySummary.avgProtein}g</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">Protein</div>
            </div>
            <div>
              <div className="text-base font-bold text-blue-400 tabular-nums">{weeklySummary.avgCarbs}g</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">Carbs</div>
            </div>
            <div>
              <div className="text-base font-bold text-amber-400 tabular-nums">{weeklySummary.avgFat}g</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">Fat</div>
            </div>
            <div>
              <div className="text-base font-bold text-cyan-400 tabular-nums">{weeklySummary.avgWater}</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">Water (oz)</div>
            </div>
          </div>
        </div>
      )}

      {/* Date Selector (single-day navigation) */}
      <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
        <button
          onClick={() => navigateDate('prev')}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-white/60" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-white font-medium text-lg">
            {isToday ? 'Today' : selectedDate}
          </span>
          <span className="text-white/40 text-xs uppercase tracking-widest">
            {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })}
          </span>
        </div>

        <button
          onClick={() => navigateDate('next')}
          className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-20"
          disabled={isToday}
        >
          <ChevronRight className="w-6 h-6 text-white/60" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="flex justify-end mb-4 gap-2">
        <button
          onClick={handleDownloadMonthlyPDF}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 hover:bg-blue-500/20 transition-all"
        >
          <Download className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Export Monthly PDF</span>
        </button>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20 hover:bg-orange-500/20 transition-all"
        >
          <Download className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Export Daily PDF</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Utensils className="w-4 h-4 text-emerald-400" />
            <span className="text-white/40 text-xs uppercase font-bold">Calories</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {Math.round(currentLog?.caloriesConsumed || 0).toLocaleString()}
            <span className="text-xs text-white/40 ml-1 font-normal">kcal</span>
          </div>
        </div>
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span className="text-white/40 text-xs uppercase font-bold">Water</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {Math.round(currentLog?.waterIntake || 0)}
            <span className="text-xs text-white/40 ml-1 font-normal">oz</span>
          </div>
        </div>
      </div>

      {/* Macro Breakdown */}
      <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-white/40 text-xs uppercase font-bold tracking-widest">Macro Breakdown</h3>
            <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing || !currentLog}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
            >
                {isAnalyzing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                    <Sparkles className="w-3 h-3" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider">Analyze Day</span>
            </button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{Math.round(currentLog?.proteinConsumed || 0)}g</div>
            <div className="text-[10px] text-white/40 uppercase tracking-tighter">Protein</div>
            <div className="h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-emerald-400" 
                style={{ width: `${Math.min(100, (currentLog?.proteinConsumed || 0) / 2)}%` }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-white">{Math.round(currentLog?.carbsConsumed || 0)}g</div>
            <div className="text-[10px] text-white/40 uppercase tracking-tighter">Carbs</div>
            <div className="h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-blue-400" 
                style={{ width: `${Math.min(100, (currentLog?.carbsConsumed || 0) / 2)}%` }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-white">{Math.round(currentLog?.fatConsumed || 0)}g</div>
            <div className="text-[10px] text-white/40 uppercase tracking-tighter">Fat</div>
            <div className="h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-orange-400" 
                style={{ width: `${Math.min(100, (currentLog?.fatConsumed || 0) / 1)}%` }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-white">{Math.round(currentLog?.fiberConsumed || 0)}g</div>
            <div className="text-[10px] text-white/40 uppercase tracking-tighter">Fiber</div>
            <div className="h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-yellow-500" 
                style={{ width: `${Math.min(100, (currentLog?.fiberConsumed || 0) / 0.3)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis Result */}
      <AnimatePresence>
        {analysis && (
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
            >
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-emerald-400" />
                            <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-xs">Dings AI Analysis</h3>
                        </div>
                        <div className="flex items-center gap-2 bg-emerald-500/20 px-3 py-1 rounded-full">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] font-bold text-emerald-400 uppercase">Score: {analysis.progressScore}/100</span>
                        </div>
                    </div>

                    <p className="text-white/80 text-sm leading-relaxed italic">
                        "{analysis.summary}"
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Positives</span>
                            </div>
                            <ul className="space-y-2">
                                {analysis.positives.map((p: string, i: number) => (
                                    <li key={i} className="text-xs text-white/60 flex gap-2">
                                        <span className="text-emerald-400">•</span>
                                        {p}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-orange-400">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Improvements</span>
                            </div>
                            <ul className="space-y-2">
                                {analysis.improvements.map((p: string, i: number) => (
                                    <li key={i} className="text-xs text-white/60 flex gap-2">
                                        <span className="text-orange-400">•</span>
                                        {p}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <div className="flex items-center gap-2 text-blue-400 mb-3">
                            <Utensils className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Recommendations for Tomorrow</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {analysis.recommendations.map((r: string, i: number) => (
                                <span key={i} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-xl text-[10px] font-medium">
                                    {r}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4" />
              {error}
          </div>
      )}

      {/* Food List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium">Food Log</h3>
          {isToday && onAddFood && (
            <button 
              onClick={onAddFood}
              className="p-2 bg-emerald-500/20 text-emerald-400 rounded-full hover:bg-emerald-500/30 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {currentLog?.foodItems && currentLog.foodItems.length > 0 ? (
          <div className="space-y-3">
            {currentLog.foodItems.map((item, idx) => (
              <motion.div 
                key={item.id || idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div>
                  <div className="text-white font-medium">{item.name}</div>
                  <div className="text-white/40 text-xs flex gap-2 mt-1">
                    <span>{item.calories} kcal</span>
                    <span>•</span>
                    <span>P: {item.protein}g</span>
                    <span>•</span>
                    <span>C: {item.carbs}g</span>
                    <span>•</span>
                    <span>F: {item.fat}g</span>
                    {item.fiber !== undefined && (
                      <>
                        <span>•</span>
                        <span className="text-yellow-500/80">Fi: {item.fiber}g</span>
                      </>
                    )}
                  </div>
                </div>
                {isToday && onDeleteLog && (
                  <button 
                    onClick={() => onDeleteLog(item.id)}
                    className="p-2 text-white/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
            <Utensils className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No food logged for this day</p>
          </div>
        )}
      </div>

      {/* Workout Status */}
      {currentLog?.workoutCompleted && (
        <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-emerald-400 font-bold text-sm uppercase tracking-widest">Workout Completed</div>
            <div className="text-white/60 text-xs">{currentLog.workoutLabel || 'Daily Session'}</div>
          </div>
        </div>
      )}
    </div>
  );
};
