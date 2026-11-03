"use client";

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { PenTool, Trash2 } from 'lucide-react';

export default function TradingViewChart({ symbol = 'ETH/USDT' }: { symbol?: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [currentPrice, setCurrentPrice] = useState<string>('---');
  const [change, setChange] = useState<string>('---');

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const isDrawingModeRef = useRef(false);
  
  const drawingStateRef = useRef<{ 
    active: boolean, 
    startPoint: { time: number, price: number } | null, 
    currentSeries: ISeriesApi<"Line"> | null 
  }>({ active: false, startPoint: null, currentSeries: null });

  const trendLinesRef = useRef<ISeriesApi<"Line">[]>([]);

  const toggleDrawingMode = () => {
    const newVal = !isDrawingMode;
    setIsDrawingMode(newVal);
    isDrawingModeRef.current = newVal;
    
    if (!newVal && drawingStateRef.current.active && drawingStateRef.current.currentSeries) {
       chartRef.current?.removeSeries(drawingStateRef.current.currentSeries);
       drawingStateRef.current.active = false;
       drawingStateRef.current.startPoint = null;
       drawingStateRef.current.currentSeries = null;
    }
  };
  
  const clearTrendLines = () => {
    trendLinesRef.current.forEach(series => {
      try {
        chartRef.current?.removeSeries(series);
      } catch (e) {
        // ignore errors if series already removed
      }
    });
    trendLinesRef.current = [];
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const binanceSymbol = symbol.replace('/', '').toUpperCase();

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e11' },
        textColor: '#8b96a8',
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 400,
      grid: {
        vertLines: { color: '#1f2937', style: 2 },
        horzLines: { color: '#1f2937', style: 2 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#1f2937',
      },
      crosshair: {
        mode: 0, // Normal mode
      },
      rightPriceScale: {
        borderColor: '#1f2937',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2, // Leave space for volume
        },
      }
    });
    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Track open order price lines
    let priceLines: any[] = [];
    const renderPriceLines = () => {
      try {
        priceLines.forEach(line => candlestickSeries.removePriceLine(line));
        priceLines = [];
        
        const userId = localStorage.getItem('token');
        if (!userId) return;
        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
        const user = users.find((u: any) => u.id === userId);
        
        if (user && user.openOrders) {
          const symbolOrders = user.openOrders.filter((o: any) => o.symbol === symbol);
          symbolOrders.forEach((order: any) => {
            let color = '#3b82f6';
            let title = 'LIMIT';
            let lineStyle = 2;
            
            if (order.type === 'TAKE_PROFIT') {
              color = '#10b981';
              title = 'TP';
            } else if (order.type === 'STOP_LOSS') {
              color = '#ef4444';
              title = 'SL';
            }
            
            const line = candlestickSeries.createPriceLine({
              price: order.price,
              color,
              lineWidth: 2,
              lineStyle,
              axisLabelVisible: true,
              title: `${title} ${order.side} ${order.amount}`,
            });
            priceLines.push(line);
          });
        }
      } catch (e) {
        console.error("Error drawing price lines:", e);
      }
    };

    renderPriceLines();
    window.addEventListener('balanceUpdated', renderPriceLines);

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // --- DRAWING LOGIC ---
    const clickHandler = (param: MouseEventParams) => {
      if (!isDrawingModeRef.current) return;
      if (!param.point || !param.time) return;
      
      const price = candlestickSeries.coordinateToPrice(param.point.y);
      if (price === null || price === undefined) return;
      
      if (!drawingStateRef.current.active) {
        drawingStateRef.current.active = true;
        drawingStateRef.current.startPoint = { time: param.time as number, price };
        
        const lineSeries = chart.addLineSeries({
          color: '#3b82f6',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        drawingStateRef.current.currentSeries = lineSeries;
        trendLinesRef.current.push(lineSeries);
        
      } else {
        drawingStateRef.current.active = false;
        drawingStateRef.current.startPoint = null;
        drawingStateRef.current.currentSeries = null;
        
        setIsDrawingMode(false);
        isDrawingModeRef.current = false;
        
        // Reset crosshair after drawing finishes
        chart.applyOptions({ crosshair: { mode: 0 } });
      }
    };

    const moveHandler = (param: MouseEventParams) => {
      if (!drawingStateRef.current.active || !drawingStateRef.current.currentSeries || !drawingStateRef.current.startPoint) return;
      if (!param.point || !param.time) return;

      const price = candlestickSeries.coordinateToPrice(param.point.y);
      if (price === null || price === undefined) return;

      const t1 = drawingStateRef.current.startPoint.time;
      const p1 = drawingStateRef.current.startPoint.price;
      const t2 = param.time as number;
      const p2 = price;

      if (t1 < t2) {
        drawingStateRef.current.currentSeries.setData([
          { time: t1 as any, value: p1 },
          { time: t2 as any, value: p2 }
        ]);
      } else if (t1 > t2) {
        drawingStateRef.current.currentSeries.setData([
          { time: t2 as any, value: p2 },
          { time: t1 as any, value: p1 }
        ]);
      }
    };

    chart.subscribeClick(clickHandler);
    chart.subscribeCrosshairMove(moveHandler);
    // ---------------------

    let isSubscribed = true;
    let ws: WebSocket | null = null;
    let tickerWs: WebSocket | null = null;

    const loadData = async () => {
      let basePrice = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3000 : symbol.includes('SOL') ? 150 : 600;
      
      const startFallback = () => {
        if (!isSubscribed) return;
        
        // Generate mock historical data
        const now = Math.floor(Date.now() / 1000);
        const cdata = [];
        const vdata = [];
        let p = basePrice;
        
        for (let i = 1000; i >= 0; i--) {
          const time = now - i * 60;
          const open = p;
          const close = p + (Math.random() * 10 - 5);
          const high = Math.max(open, close) + Math.random() * 5;
          const low = Math.min(open, close) - Math.random() * 5;
          
          cdata.push({ time, open, high, low, close });
          vdata.push({ time, value: Math.random() * 100, color: close >= open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' });
          p = close;
        }
        
        candlestickSeries.setData(cdata);
        volumeSeries.setData(vdata);
        setCurrentPrice(p.toFixed(2));
        setChange((Math.random() * 5 - 2.5).toFixed(2));
        
        // Setup mock live interval
        setInterval(() => {
          if (!isSubscribed) return;
          const time = Math.floor(Date.now() / 1000);
          const open = p;
          const close = p + (Math.random() * 4 - 2);
          const high = Math.max(open, close) + Math.random() * 2;
          const low = Math.min(open, close) - Math.random() * 2;
          p = close;
          
          candlestickSeries.update({ time, open, high, low, close });
          volumeSeries.update({ time, value: Math.random() * 50, color: close >= open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' });
          setCurrentPrice(close.toFixed(2));
        }, 2000);
      };

      try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=1000`);
        if (!res.ok) throw new Error("API failed");
        const data = await res.json();
        if (!isSubscribed) return;

        const cdata = data.map((d: any) => ({
          time: (d[0] / 1000) as any,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        const vdata = data.map((d: any) => ({
          time: (d[0] / 1000) as any,
          value: parseFloat(d[5]),
          color: parseFloat(d[4]) >= parseFloat(d[1]) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
        }));

        candlestickSeries.setData(cdata);
        volumeSeries.setData(vdata);

        const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
        const tickerData = await tickerRes.json();
        if (isSubscribed) {
          setCurrentPrice(parseFloat(tickerData.lastPrice).toFixed(2));
          setChange(parseFloat(tickerData.priceChangePercent).toFixed(2));
        }

        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol.toLowerCase()}@kline_1m`);
        ws.onerror = () => {
           console.log("WebSocket failed, starting fallback");
        };
        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          const message = JSON.parse(event.data);
          const kline = message.k;
          
          const time = Math.floor(kline.t / 1000) as any;
          const open = parseFloat(kline.o);
          const high = parseFloat(kline.h);
          const low = parseFloat(kline.l);
          const close = parseFloat(kline.c);
          const volume = parseFloat(kline.v);
          
          candlestickSeries.update({
            time, open, high, low, close
          });
          volumeSeries.update({
            time,
            value: volume,
            color: close >= open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
          });
        };

        tickerWs = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol.toLowerCase()}@ticker`);
        tickerWs.onmessage = (event) => {
          if (!isSubscribed) return;
          const message = JSON.parse(event.data);
          setCurrentPrice(parseFloat(message.c).toFixed(2));
          setChange(parseFloat(message.P).toFixed(2));
        };
      } catch (err) {
        console.error("Failed to fetch chart data:", err);
        startFallback();
      }
    };

    loadData();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isSubscribed = false;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('balanceUpdated', renderPriceLines);
      chart.unsubscribeClick(clickHandler);
      chart.unsubscribeCrosshairMove(moveHandler);
      if (ws) ws.close();
      if (tickerWs) tickerWs.close();
      chart.remove();
    };
  }, [symbol]);

  // Adjust crosshair mode visually if in drawing mode
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        crosshair: {
          mode: isDrawingMode ? 1 : 0, // Magnet mode when drawing
        },
      });
    }
  }, [isDrawingMode]);

  return (
    <div className="flex flex-col h-full bg-[#0b0e11] absolute inset-0">
      <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-[#0b0e11] z-10">
        <div className="flex items-center space-x-6">
          <h2 className="text-xl font-bold text-white">{symbol}</h2>
          <div className="flex flex-col">
            <span className="text-xs text-slate-500">Price</span>
            <span className={`font-mono text-sm font-semibold ${Number(change) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {currentPrice}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-500">24h Change</span>
            <span className={`font-mono text-sm ${Number(change) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {Number(change) > 0 ? '+' : ''}{change}%
            </span>
          </div>
        </div>
        
        {/* Drawing Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDrawingMode}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isDrawingMode 
                ? 'bg-indigo-600 text-white' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
            title="Draw Trend Line"
          >
            <PenTool size={16} />
            {isDrawingMode ? 'Drawing...' : 'Draw'}
          </button>
          
          <button
            onClick={clearTrendLines}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-slate-800 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
            title="Clear Trend Lines"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      {/* Visual cue when drawing */}
      {isDrawingMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
          Click to start point, then click to end point
        </div>
      )}

      <div ref={chartContainerRef} className="w-full flex-grow relative z-0" />
    </div>
  );
}
