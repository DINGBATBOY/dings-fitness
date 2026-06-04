// DEPRECATED: Bio Vision prototype, not used
// @ts-nocheck
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Target } from 'lucide-react';

export const MotivationMap = ({ data }: { data: any }) => {
  if (!data) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
          <Target className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">4-Week Motivation Map</h2>
      </div>
      
      <p className="text-slate-600 mb-6 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
        {data.projectionText}
      </p>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} domain={['dataMin - 1', 'dataMax + 1']} />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ color: '#0f172a', fontWeight: 500 }}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="bodyFat" 
              name="Body Fat %"
              stroke="#6366f1" 
              strokeWidth={3}
              dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
