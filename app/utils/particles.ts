export function spawnParticles(chkEl: HTMLElement, color: string): void {
  const rect = chkEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const canvas = document.createElement('canvas');
  canvas.className = 'particle-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let resolvedColor = color;
  if (color?.startsWith('var(--')) {
    const varName = color.slice(4, -1);
    resolvedColor =
      getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#4ade80';
  }

  const count = 14;
  const shapes = ['circle', 'square', 'star'] as const;
  type Shape = (typeof shapes)[number];

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ax: number;
    ay: number;
    alpha: number;
    size: number;
    color: string;
    shape: Shape;
    rot: number;
    rotV: number;
  }

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.4;
    const speed = 2.5 + Math.random() * 3.5;
    const size = 3 + Math.random() * 3;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      ax: 0,
      ay: 0.18,
      alpha: 1,
      size,
      color: resolvedColor,
      shape: shapes[i % 3],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.3,
    });
  }

  let start: number | null = null;
  let prev: number | null = null;
  function frame(ts: number) {
    if (!ctx) {
      canvas.remove();
      return;
    }
    if (!start) start = ts;
    const dt = Math.min((ts - (prev ?? ts)) / (1000 / 60), 3);
    prev = ts;
    const elapsed = (ts - start) / 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach((p) => {
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, 1 - elapsed / 0.7);
      p.rot += p.rotV * dt;
      if (p.alpha > 0) alive = true;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a = (j * Math.PI * 2) / 5 - Math.PI / 2;
          const ai = a + Math.PI / 5;
          ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
          ctx.lineTo(Math.cos(ai) * p.size * 0.45, Math.sin(ai) * p.size * 0.45);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
    if (alive) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
