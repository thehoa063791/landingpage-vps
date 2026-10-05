// ChartContainer/ChartTooltip pattern from shadcn/ui, styled with local Polaris tokens.
import React from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { text } from './ui.js';
const h = React.createElement;
const number = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(n || 0));
export function compact(n) {
  const a = Math.abs(n);
  return a >= 1e9 ? `${number(n / 1e9)} tỷ` : a >= 1e6 ? `${number(n / 1e6)} tr` : a >= 1e3 ? `${number(n / 1e3)} N` : number(n);
}
function dateLabel(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : value;
}
export function ChartContainer({ children, height = 240, config }) {
  const style = { height, minWidth: 0, ...Object.fromEntries(Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])) };
  return h('div', { className: 'chart-container', style }, h(ResponsiveContainer, { width: '100%', height: height }, children));
}
function ChartTooltip({ active, payload, label, money }) {
  if (!active || !payload?.length) return null;
  return h('div', { className: 'chart-tooltip' }, h('strong', null, dateLabel(label)), payload.map(item =>
    h('div', { key: item.dataKey }, h('span', { className: 'chart-key', style: { background: item.color } }), item.name, h('b', null, `${number(item.value)}${money ? ' ₫' : ''}`))));
}
export function SeriesChart({ title, rows, series, height = 240, money = false, type = 'line' }) {
  const [table, setTable] = React.useState(false);
  const config = Object.fromEntries(series.map(item => [item.key, { label: item.label, color: item.color }]));
  const line = type === 'line';
  return h('div', { className: 'ui-card panel-card chart-card' },
    h('div', { className: 'panel-title' }, h('span', null, title), h('button', { className: 'ui-button ui-button-link', onClick: () => setTable(v => !v) }, table ? text.chart : text.table)),
    series.length ? h('div', { className: 'chart-legend' }, series.map(item => h('span', { key: item.key }, h('i', { style: { background: item.color } }), item.label))) : null,
    table ? h('div', { className: 'table-shell' }, h('table', { className: 'react-table' },
      h('thead', null, h('tr', null, h('th', null, 'Mốc'), series.map(item => h('th', { key: item.key, className: 'num' }, item.label)))),
      h('tbody', null, rows.map((row, i) => h('tr', { key: i }, h('td', null, dateLabel(row.label)), series.map(item => h('td', { key: item.key, className: 'num' }, `${number(row[item.key])}${money ? ' ₫' : ''}`))))))) :
      h(ChartContainer, { height, config }, h(line ? LineChart : BarChart, { data: rows, layout: line ? 'horizontal' : 'vertical', margin: { top: 8, right: 16, left: 0, bottom: 0 } },
        h(CartesianGrid, { horizontal: line, vertical: !line, stroke: 'var(--border-secondary)' }),
        h(XAxis, { dataKey: line ? 'label' : undefined, type: line ? 'category' : 'number', tickFormatter: line ? dateLabel : compact, axisLine: false, tickLine: false, tick: { fill: 'var(--muted-foreground)', fontSize: 12 }, minTickGap: 24 }),
        h(YAxis, { dataKey: line ? undefined : 'label', type: line ? 'number' : 'category', width: line ? 52 : 120, tickCount: 5, tickFormatter: line ? compact : undefined, axisLine: false, tickLine: false, tick: { fill: 'var(--muted-foreground)', fontSize: 12 } }),
        h(Tooltip, { content: h(ChartTooltip, { money }), cursor: { stroke: 'var(--border)' } }),
        series.map(item => h(line ? Line : Bar, { key: item.key, dataKey: item.key, name: item.label, stroke: item.color, fill: item.color, strokeWidth: line ? 2 : 0, dot: false, activeDot: { r: 4, stroke: 'var(--card)', strokeWidth: 2 }, strokeDasharray: item.dashed ? '5 4' : undefined, type: 'linear', radius: [0, 4, 4, 0], maxBarSize: 28, isAnimationActive: false })))),
    !rows.length ? h('p', { className: 'chart-empty' }, text.empty) : null);
}
export function ChartPanel({ title, type = 'bar', data, limit = 8, height = 240 }) {
  const entries = Object.entries(data || {});
  const rows = (type === 'line' ? entries.sort(([a], [b]) => a.localeCompare(b)).slice(-limit) : entries.sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, limit)).map(([label, value]) => ({ label, value: Number(value || 0) }));
  return h(SeriesChart, { title, rows, type: type === 'line' ? 'line' : 'bar', height, series: [{ key: 'value', label: title, color: 'var(--chart-1)' }] });
}
export function AdsTrendChart({ rows = [] }) {
  const values = rows.map(row => ({ label: row.d, spend: Number(row.spend || 0), revenue: Number(row.revenue || 0), registrations: Number(row.registrations || 0) }));
  return h('div', { className: 'grid-2-react' },
    h(SeriesChart, { title: 'Chi tiêu và doanh thu theo ngày', rows: values, height: 320, money: true, series: [{ key: 'spend', label: 'Chi tiêu', color: 'var(--chart-2)', dashed: true }, { key: 'revenue', label: 'Doanh thu', color: 'var(--chart-3)' }] }),
    h(SeriesChart, { title: 'Đăng ký theo ngày', rows: values, height: 320, series: [{ key: 'registrations', label: 'Đăng ký', color: 'var(--chart-1)' }] }));
}
