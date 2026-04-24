import React, { useState, useEffect, useCallback, useRef } from 'react';

function LineChart({ data, label, colorClass, strokeColor, onExpand, isExpanded, showAllLabels }) {
  const svgRef = useRef(null);

  if (!data || data.length === 0) return <div className="text-sm text-gray-500">No data</div>;

  const max = Math.max(...data.map(d => d.value), 0);
  const chartMax = Math.max(Math.ceil(max / 5) * 5, 5); // Scale maximum to next multiple of 5
  
  const width = isExpanded ? 800 : 600;
  const height = isExpanded ? 300 : 150;
  const paddingX = isExpanded ? 60 : 40; // Extra left padding for Y-axis title
  // Increase bottom padding if expanded to accommodate X-axis title and rotated labels
  const paddingY = isExpanded ? 40 : 20;
  const marginTop = isExpanded ? 35 : 20; // Extra top margin for main title
  
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY - marginTop;
  
  const getX = (index) => paddingX + (index * (usableWidth / Math.max(1, data.length - 1)));
  const getY = (value) => {
    return height - paddingY - ((value / chartMax) * usableHeight);
  };
  
  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');

  const handleExport = () => {
    if (!svgRef.current) return;
    const exportHeight = height + (isExpanded ? 15 : 0);
    let svgData = new XMLSerializer().serializeToString(svgRef.current);
    // Replace percentage width with absolute width for the blob to prevent cropping
    svgData = svgData.replace('width="100%"', `width="${width}"`);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    // Scale up for better resolution
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = exportHeight * scale;

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, exportHeight);
      URL.revokeObjectURL(url);
      
      const a = document.createElement('a');
      a.download = `${label.toLowerCase()}-trend.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  };

  // Compute Y-axis ticks in increments of 5
  let yTicks = [];
  for (let i = 0; i <= chartMax; i += 5) {
    yTicks.push(i);
  }

  return (
    <div className={`w-full ${isExpanded ? '' : 'overflow-x-auto'} relative group`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-semibold uppercase tracking-widest ${colorClass}`}>{label}</p>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isExpanded && onExpand && (
            <button onClick={() => onExpand({ data, label, colorClass, strokeColor })} className="text-[10px] uppercase font-bold text-gray-400 hover:text-indigo-600 px-2 py-1 rounded bg-gray-100 mix-blend-multiply">
              Expand
            </button>
          )}
          <button onClick={handleExport} className="text-[10px] uppercase font-bold text-gray-400 hover:text-indigo-600 px-2 py-1 rounded bg-gray-100 mix-blend-multiply">
            Export PNG
          </button>
        </div>
      </div>
      <svg ref={svgRef} width="100%" height={height + (isExpanded ? 15 : 0)} viewBox={`0 0 ${width} ${height + (isExpanded ? 15 : 0)}`} preserveAspectRatio="none" className="min-w-100 overflow-visible" xmlns="http://www.w3.org/2000/svg">
        {/* Horizontal Grid lines & Y Axis Labels */}
        {yTicks.map(val => {
          const yPos = getY(val);
          return (
            <g key={`y-${val}`}>
              <line 
                x1={paddingX} 
                y1={yPos}
                x2={width - paddingX} 
                y2={yPos}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <text
                x={paddingX - 10}
                y={yPos + 4}
                textAnchor="end"
                fontSize="10"
                fill="#94a3b8"
              >
                {val}
              </text>
            </g>
          );
        })}
        
        {/* Vertical Grid lines & Date Labels */}
        {data.map((d, i) => {
          const showLabel = showAllLabels || data.length < 10 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1;
          return (
            <g key={`x-${i}`}>
              {(showAllLabels || showLabel) && (
                <line 
                  x1={getX(i)} 
                  y1={height - paddingY}
                  x2={getX(i)} 
                  y2={paddingY}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
              )}
              {showLabel && (
                <text
                  x={getX(i)}
                  y={height - (isExpanded ? 20 : 0)}
                  textAnchor="middle"
                  fontSize={showAllLabels && data.length > 20 ? "8" : "10"}
                  fill="#94a3b8"
                >
                  {d.date}
                </text>
              )}
            </g>
          );
        })}

        {/* Titles */}
        {isExpanded && (
          <>
            <text
              x={width / 2}
              y={20} // Position at top
              textAnchor="middle"
              fontSize="14"
              fontWeight="bold"
              className="uppercase tracking-widest"
              fill="#334155"
            >
              {label} Graph
            </text>
            <text
              x={-((height - paddingY + marginTop) / 2)} // Position centered vertically
              y={20} // Position from the left edge (rotated)
              transform="rotate(-90)"
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              className="uppercase tracking-widest"
              fill="#64748b"
            >
              Count
            </text>
          </>
        )}

        {/* X Axis Title */}
        {isExpanded && (
          <text
            x={width / 2}
            y={height + 10}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            className="uppercase tracking-widest"
            fill="#64748b"
          >
            Dates
          </text>
        )}
        {/* The Line & Points */}
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          points={points}
        />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={getX(i)}
            cy={getY(d.value)}
            r={3}
            fill={strokeColor}
            stroke="#fff"
            strokeWidth="1"
          >
            <title>{d.date}: {d.value} {label}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export default function SuperAdminTrendPanel({ supabase, barangays }) {
  const [startDate, setStartDate] = useState('2026-03-30');
  const [endDate, setEndDate] = useState('2026-04-17');
  const [filterBarangay, setFilterBarangay] = useState('all');
  const [loading, setLoading] = useState(false);
  const [trendData, setTrendData] = useState({ requests: [], released: [], cancelled: [] });

  // Modal State
  const [expandedChart, setExpandedChart] = useState(null);
  const [expandedShowAllLabels, setExpandedShowAllLabels] = useState(false);

  const loadTrendData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);

    try {
      // Fetch requests created within the date range
      // For cancelled, we will count status = 'cancelled'
      // For releases, we look at release logs
      let reqQuery = supabase
        .from('resident_intake_requests')
        .select('id, barangay_id, status, created_at')
        .gte('created_at', `${startDate}T00:00:00Z`)
        .lte('created_at', `${endDate}T23:59:59Z`);
        
      // For releases: the actual 'release' event happened in the date range
      let relActionQuery = supabase
        .from('release_logs')
        .select('id, barangay_id, released_at')
        .gte('released_at', `${startDate}T00:00:00Z`)
        .lte('released_at', `${endDate}T23:59:59Z`);

      // For requests that were later released: the request event happened in the date range
      let relRequestedQuery = supabase
        .from('release_logs')
        .select('id, barangay_id, requested_at')
        .gte('requested_at', `${startDate}T00:00:00Z`)
        .lte('requested_at', `${endDate}T23:59:59Z`);

      if (filterBarangay !== 'all') {
        reqQuery = reqQuery.eq('barangay_id', filterBarangay);
        relActionQuery = relActionQuery.eq('barangay_id', filterBarangay);
        relRequestedQuery = relRequestedQuery.eq('barangay_id', filterBarangay);
      }

      const [reqResult, relActionResult, relRequestedResult] = await Promise.all([reqQuery, relActionQuery, relRequestedQuery]);

      const requests = reqResult.data || [];
      const releases = relActionResult.data || [];
      const releasedRequests = relRequestedResult.data || [];

      // Generate date array
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const dateMap = {};

      for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateMap[dateStr] = {
          date: displayDate,
          requestsCount: 0,
          releasedCount: 0,
          cancelledCount: 0
        };
      }

      for (const r of requests) {
        if (!r.created_at) continue;
        const dStr = r.created_at.split('T')[0];
        if (dateMap[dStr]) {
          dateMap[dStr].requestsCount += 1;
          if (r.status === 'cancelled') {
            dateMap[dStr].cancelledCount += 1;
          }
        }
      }

      for (const req of releasedRequests) {
        if (!req.requested_at) continue;
        const dStr = req.requested_at.split('T')[0];
        if (dateMap[dStr]) {
          dateMap[dStr].requestsCount += 1;
        }
      }

      for (const r of releases) {
        if (!r.released_at) continue;
        const dStr = r.released_at.split('T')[0];
        if (dateMap[dStr]) {
           dateMap[dStr].releasedCount += 1;
        }
      }

      const rawData = Object.values(dateMap);
      setTrendData({
        requests: rawData.map(d => ({ date: d.date, value: d.requestsCount })),
        released: rawData.map(d => ({ date: d.date, value: d.releasedCount })),
        cancelled: rawData.map(d => ({ date: d.date, value: d.cancelledCount })),
      });
    } catch (err) {
      console.error('Error fetching trend data:', err);
    }

    setLoading(false);
  }, [supabase, startDate, endDate, filterBarangay]);

  useEffect(() => {
    const run = async () => { await loadTrendData(); };
    run();
  }, [loadTrendData]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">Analytics</p>
          <h2 className="text-xl font-bold text-gray-900">Trends Over Time</h2>
          <p className="mt-1 text-sm text-gray-500">View Requests, Released, and Cancelled documents across a specific date range.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1">Barangay</label>
            <select value={filterBarangay} onChange={(e) => setFilterBarangay(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-500">
              <option value="all">All Barangays</option>
              {barangays.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading trend charts...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <LineChart data={trendData.requests} label="Requests" colorClass="text-cyan-500" strokeColor="#06b6d4" onExpand={setExpandedChart} />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
             <LineChart data={trendData.released} label="Released" colorClass="text-emerald-500" strokeColor="#10b981" onExpand={setExpandedChart} />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
             <LineChart data={trendData.cancelled} label="Cancelled" colorClass="text-rose-500" strokeColor="#f43f5e" onExpand={setExpandedChart} />
          </div>
        </div>
      )}

      {/* Expanded Chart Modal */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-4xl relative flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Expanded View</h3>
              <div className="flex items-center gap-4">
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                      checked={expandedShowAllLabels}
                      onChange={(e) => setExpandedShowAllLabels(e.target.checked)}
                    />
                    <span className="text-sm font-medium text-slate-600">Plot every point label</span>
                 </label>
                 <button 
                   onClick={() => {
                     setExpandedChart(null);
                     setExpandedShowAllLabels(false);
                   }}
                   className="bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center font-bold"
                 >
                   ✕
                 </button>
              </div>
            </div>
            
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 overflow-x-auto min-h-87.5">
              <LineChart 
                data={expandedChart.data} 
                label={expandedChart.label} 
                colorClass={expandedChart.colorClass} 
                strokeColor={expandedChart.strokeColor}
                isExpanded={true}
                showAllLabels={expandedShowAllLabels}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}