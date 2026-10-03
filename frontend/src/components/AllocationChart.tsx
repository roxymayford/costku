import React from 'react';
import { NavLink } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatRupiah } from '../lib/calculator';
import { Icon } from './Icon';

interface AllocationChartProps {
  targetNeeds: number;
  targetWants: number;
  targetSavings: number;
  actualNeeds: number;
  actualWants: number;
  actualSavings: number;
}

const COLORS = {
  needs: '#111111',
  wants: '#ff4d25',
  savings: '#008547',
};

export const AllocationChart: React.FC<AllocationChartProps> = ({
  targetNeeds,
  targetWants,
  targetSavings,
  actualNeeds,
  actualWants,
  actualSavings,
}) => {
  const data = [
    { name: 'Kebutuhan', value: actualNeeds || 0.001, nominal: actualNeeds, target: targetNeeds, color: COLORS.needs },
    { name: 'Keinginan', value: actualWants || 0.001, nominal: actualWants, target: targetWants, color: COLORS.wants },
    { name: 'Tabungan', value: actualSavings || 0.001, nominal: actualSavings, target: targetSavings, color: COLORS.savings },
  ];

  const needsPct = targetNeeds > 0 ? Math.round((actualNeeds / targetNeeds) * 100) : 0;
  const wantsPct = targetWants > 0 ? Math.round((actualWants / targetWants) * 100) : 0;
  const savingsPct = targetSavings > 0 ? Math.round((actualSavings / targetSavings) * 100) : 0;

  return (
    <div className="allocation-chart-widget" aria-label="Ringkasan Alokasi Pengeluaran vs Anggaran">
      <div className="chart-header">
        <div>
          <small className="accent">PENGELUARAN VS ANGGARAN</small>
          <h4>KEMANA UANGMU PERGI</h4>
        </div>
        <NavLink to="/alokasi" className="chart-complete-link">
          <span>Lihat analisis lengkap</span>
          <Icon name="arrowRight" size={12} />
        </NavLink>
      </div>

      <div className="compact-donut-layout">
        <div className="compact-donut-wrap">
          <ResponsiveContainer width={96} height={96}>
            <PieChart>
              <Pie
                data={data}
                innerRadius={30}
                outerRadius={44}
                paddingAngle={2}
                dataKey="value"
                stroke="#efece6"
                strokeWidth={1.5}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(_val: any, name: any, item: any) => [
                  formatRupiah(item.payload.nominal),
                  name,
                ]}
                contentStyle={{
                  backgroundColor: '#fcf9f3',
                  border: '1px solid #111',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: "'Hanken Grotesk', -apple-system, sans-serif",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="compact-legend-list">
          <div className="compact-legend-row">
            <span className="compact-legend-dot" style={{ backgroundColor: COLORS.needs }} />
            <span className="compact-legend-name">Kebutuhan</span>
            <span className="compact-legend-values">
              <b>{formatRupiah(actualNeeds)}</b> / {formatRupiah(targetNeeds)} ({needsPct}%)
            </span>
          </div>

          <div className="compact-legend-row">
            <span className="compact-legend-dot" style={{ backgroundColor: COLORS.wants }} />
            <span className="compact-legend-name">Keinginan</span>
            <span className="compact-legend-values">
              <b className={actualWants > targetWants ? 'red-text' : ''}>{formatRupiah(actualWants)}</b> / {formatRupiah(targetWants)} ({wantsPct}%)
            </span>
          </div>

          <div className="compact-legend-row">
            <span className="compact-legend-dot" style={{ backgroundColor: COLORS.savings }} />
            <span className="compact-legend-name">Tabungan</span>
            <span className="compact-legend-values">
              <b className="green-text">{formatRupiah(actualSavings)}</b> / {formatRupiah(targetSavings)} ({savingsPct}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
