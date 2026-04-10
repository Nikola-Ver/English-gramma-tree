import { useEffect, useRef } from 'react';
import { TL_DATA } from '../../data/timelineData';

interface Props {
  selectedKey: string | null;
  onSelectTense: (key: string) => void;
}

export function Timeline({ selectedKey, onSelectTense }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !wrapRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrapRef.current.clientWidth - 32;
    const ROW_H = 28,
      ROWS = TL_DATA.length;
    const PAD_L = 130,
      PAD_R = 24,
      PAD_T = 36,
      PAD_B = 28;
    const H = PAD_T + ROWS * ROW_H + PAD_B;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cs = getComputedStyle(document.documentElement);
    const C_MUTED = cs.getPropertyValue('--muted').trim() || '#6b7080';
    const C_MUTED2 = cs.getPropertyValue('--muted2').trim() || '#8b92a8';
    const C_BG2 = cs.getPropertyValue('--bg2').trim() || '#131620';

    const AXIS_MIN = -10,
      AXIS_MAX = 10;
    function xOf(v: number) {
      return PAD_L + ((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * (W - PAD_L - PAD_R);
    }
    const nowX = xOf(0);

    ctx.fillStyle = C_BG2;
    ctx.fillRect(0, 0, W, H);

    const ticks = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];
    ticks.forEach((t) => {
      const x = xOf(t);
      ctx.strokeStyle = t === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = t === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD_T - 14);
      ctx.lineTo(x, PAD_T + ROWS * ROW_H);
      ctx.stroke();
      ctx.fillStyle = t === 0 ? C_MUTED2 : C_MUTED;
      ctx.font = `${t === 0 ? '600 ' : ''}10px Outfit,sans-serif`;
      ctx.textAlign = 'center';
      const lbl = t === 0 ? 'СЕЙЧАС' : '';
      if (t === 0 || t === -10 || t === 10 || t === -5 || t === 5) ctx.fillText(lbl, x, PAD_T - 4);
    });

    const pastEnd = xOf(0) - 1,
      futureStart = xOf(0) + 1;
    ctx.fillStyle = 'rgba(56,189,248,0.03)';
    ctx.fillRect(PAD_L, PAD_T, pastEnd - PAD_L, ROWS * ROW_H);
    ctx.fillStyle = 'rgba(74,222,128,0.03)';
    ctx.fillRect(futureStart, PAD_T, W - PAD_R - futureStart, ROWS * ROW_H);

    ctx.font = '10px Outfit,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = C_MUTED;
    ctx.fillText('← ПРОШЛОЕ', PAD_L + (pastEnd - PAD_L) / 2, PAD_T - 4);
    ctx.fillText('БУДУЩЕЕ →', futureStart + (W - PAD_R - futureStart) / 2, PAD_T - 4);

    TL_DATA.forEach((d, i) => {
      const y = PAD_T + i * ROW_H + ROW_H / 2;
      const x1 = xOf(d.start),
        x2 = xOf(d.end);
      const col = d.color;
      const isSelected = selectedKey === d.key;
      const isAnySelected = !!selectedKey;
      const dimmed = isAnySelected && !isSelected;

      if (isSelected) {
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.07;
        ctx.fillRect(0, PAD_T + i * ROW_H, W, ROW_H);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(0, PAD_T + i * ROW_H + 3, 3, ROW_H - 6);
        ctx.restore();
      } else {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent';
        ctx.fillRect(PAD_L, PAD_T + i * ROW_H, W - PAD_L - PAD_R, ROW_H);
      }

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.2 : 1;

      ctx.font = isSelected ? 'bold 11.5px Outfit,sans-serif' : '11px Outfit,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = isSelected ? col : C_MUTED2;
      ctx.fillText(d.label, PAD_L - 8, y + 4);

      if (d.type === 'point') {
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.beginPath();
        const ds = isSelected ? 9 : 7;
        ctx.moveTo(x1, y - ds);
        ctx.lineTo(x1 + ds, y);
        ctx.lineTo(x1, y + ds);
        ctx.lineTo(x1 - ds, y);
        ctx.closePath();
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(x1, y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (d.type === 'arrow') {
        const bh = isSelected ? 10 : 8;
        ctx.save();
        ctx.globalAlpha = isSelected ? 0.28 : 0.18;
        ctx.fillStyle = col;
        ctx.beginPath();
        (
          ctx as CanvasRenderingContext2D & {
            roundRect: (x: number, y: number, w: number, h: number, r: number) => void;
          }
        ).roundRect(PAD_L, y - bh / 2, W - PAD_L - PAD_R, bh, 3);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = col;
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.globalAlpha = isSelected ? 1 : 0.7;
        ctx.beginPath();
        ctx.moveTo(PAD_L + 6, y - 5);
        ctx.lineTo(PAD_L, y);
        ctx.lineTo(PAD_L + 6, y + 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W - PAD_R - 6, y - 5);
        ctx.lineTo(W - PAD_R, y);
        ctx.lineTo(W - PAD_R - 6, y + 5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        const bh = isSelected ? 13 : 10;
        ctx.save();
        ctx.globalAlpha = isSelected ? 0.3 : 0.22;
        ctx.fillStyle = col;
        ctx.beginPath();
        (
          ctx as CanvasRenderingContext2D & {
            roundRect: (x: number, y: number, w: number, h: number, r: number) => void;
          }
        ).roundRect(x1, y - bh / 2, x2 - x1, bh, 3);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = col;
        ctx.lineWidth = isSelected ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        const capR = isSelected ? 5 : 4;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x1, y, capR, 0, Math.PI * 2);
        ctx.fill();
        if (d.dotEnd === false) {
          ctx.strokeStyle = col;
          ctx.lineWidth = isSelected ? 2.5 : 2;
          ctx.beginPath();
          ctx.moveTo(x2 - 6, y - 5);
          ctx.lineTo(x2, y);
          ctx.lineTo(x2 - 6, y + 5);
          ctx.stroke();
        } else {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x2, y, capR, 0, Math.PI * 2);
          ctx.fill();
          if (d.dotEnd === true) {
            ctx.strokeStyle = col;
            ctx.lineWidth = isSelected ? 2 : 1.5;
            ctx.globalAlpha = isSelected ? 0.7 : 0.5;
            ctx.beginPath();
            ctx.arc(x2, y, isSelected ? 9 : 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.restore();
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(nowX, PAD_T - 14);
    ctx.lineTo(nowX, PAD_T + ROWS * ROW_H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px Outfit,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ NOW', nowX, PAD_T - 16);
  }

  useEffect(() => {
    draw();
  });

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !wrapRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const W = wrapRef.current.clientWidth - 32;
    const PAD_L = 130,
      PAD_R = 24,
      PAD_T = 36;
    const ROW_H = 28;
    const AXIS_MIN = -10,
      AXIS_MAX = 10;
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    function xOf(v: number) {
      return PAD_L + ((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * (W - PAD_L - PAD_R);
    }
    TL_DATA.forEach((d, i) => {
      const x1 = xOf(d.start),
        x2 = xOf(d.end);
      const inY = my >= PAD_T + i * ROW_H && my <= PAD_T + (i + 1) * ROW_H;
      const inX = d.type === 'arrow' ? true : mx >= x1 - 10 && mx <= x2 + 10;
      if (inY && inX) onSelectTense(d.key);
    });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const tip = tooltipRef.current;
    if (!canvas || !tip || !wrapRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const W = wrapRef.current.clientWidth - 32;
    const PAD_L = 130,
      PAD_R = 24,
      PAD_T = 36,
      ROW_H = 28;
    const AXIS_MIN = -10,
      AXIS_MAX = 10;
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    function xOf(v: number) {
      return PAD_L + ((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * (W - PAD_L - PAD_R);
    }
    let hit: (typeof TL_DATA)[0] | null = null;
    TL_DATA.forEach((d, i) => {
      const x1 = xOf(d.start),
        x2 = xOf(d.end);
      const inY = my >= PAD_T + i * ROW_H && my <= PAD_T + (i + 1) * ROW_H;
      const inX = d.type === 'arrow' ? true : mx >= x1 - 10 && mx <= x2 + 10;
      if (inY && inX) hit = d;
    });
    if (hit) {
      tip.style.display = 'block';
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top = `${e.clientY - 10}px`;
      tip.innerHTML = `<div class="ttt-name" style="color:${(hit as (typeof TL_DATA)[0]).color}">${(hit as (typeof TL_DATA)[0]).label}</div><div class="ttt-desc">${(hit as (typeof TL_DATA)[0]).desc}</div>`;
    } else {
      tip.style.display = 'none';
    }
  }

  return (
    <>
      <div ref={wrapRef} className="tt-timeline-wrap">
        <div className="tt-timeline-title">📊 Шкала времени — когда происходит действие</div>
        <canvas
          ref={canvasRef}
          className="tt-timeline-canvas"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            if (tooltipRef.current) tooltipRef.current.style.display = 'none';
          }}
        />
        <div className="tt-timeline-legend">
          {TL_DATA.map((d) => (
            <div
              key={d.key}
              className="tt-tl-leg-item"
              style={{
                opacity: selectedKey && selectedKey !== d.key ? 0.35 : 1,
                fontWeight: selectedKey === d.key ? 600 : 400,
              }}
              onClick={() => onSelectTense(d.key)}
            >
              <div className="tt-tl-leg-dot" style={{ background: d.color }} />
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div ref={tooltipRef} className="tt-timeline-tooltip" style={{ display: 'none' }} />
    </>
  );
}
