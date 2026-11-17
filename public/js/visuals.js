// Moving backgrounds ("visuals"): bubbles, strawberries, stars and more,
// drawn on a canvas behind a form. Used by the builder, the public form, the dashboard and the home page.
//
//   const handle = Visuals.mount(element, 'bubbles', 'fixed');   // start
//   handle.stop();                                                // remove
//
// mode: 'fixed' (whole screen) or 'absolute' (fills the element)

const Visuals = (() => {
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const CONFETTI_COLORS = ['#ff6b6b', '#fcc419', '#51cf66', '#339af0', '#cc5de8', '#ff922b', '#f06595'];

  // motion: fall / rise / wander / twinkle
  // look:   emoji / bubble / star / snow / confetti / glow / rain
  // The keys must match VISUALS in server.js
  const LIST = {
    none: { label: 'None', icon: '∅' },
    bubbles: { label: 'Bubbles', icon: '🫧', motion: 'rise', look: 'bubble', count: 26, size: [12, 46], speed: [18, 48] },
    strawberries: { label: 'Strawberries', icon: '🍓', motion: 'fall', look: 'emoji', chars: ['🍓'], count: 20, size: [20, 36], speed: [30, 70], spin: 1.2 },
    stars: { label: 'Stars', icon: '⭐', motion: 'twinkle', look: 'star', count: 80, size: [3, 8], shooting: true },
    hearts: { label: 'Hearts', icon: '💖', motion: 'rise', look: 'emoji', chars: ['💖', '💗', '💕', '❤️'], count: 22, size: [16, 32], speed: [25, 55], spin: 0.3 },
    snow: { label: 'Snow', icon: '❄️', motion: 'fall', look: 'snow', count: 90, size: [2, 6], speed: [20, 55] },
    confetti: { label: 'Confetti', icon: '🎉', motion: 'fall', look: 'confetti', count: 70, size: [6, 12], speed: [40, 90], spin: 4 },
    sakura: { label: 'Cherry blossom', icon: '🌸', motion: 'fall', look: 'emoji', chars: ['🌸'], count: 24, size: [16, 28], speed: [20, 45], spin: 1 },
    flowers: { label: 'Flowers', icon: '🌼', motion: 'fall', look: 'emoji', chars: ['🌼', '🌷', '🌻', '🌺'], count: 20, size: [18, 32], speed: [20, 45], spin: 0.8 },
    leaves: { label: 'Autumn leaves', icon: '🍂', motion: 'fall', look: 'emoji', chars: ['🍂', '🍁', '🍃'], count: 22, size: [18, 32], speed: [25, 55], spin: 1.5 },
    balloons: { label: 'Balloons', icon: '🎈', motion: 'rise', look: 'emoji', chars: ['🎈'], count: 14, size: [28, 46], speed: [30, 60], spin: 0.15 },
    butterflies: { label: 'Butterflies', icon: '🦋', motion: 'wander', look: 'emoji', chars: ['🦋'], count: 12, size: [22, 34], speed: [25, 50] },
    fireflies: { label: 'Fireflies', icon: '🌟', motion: 'wander', look: 'glow', count: 40, size: [2, 4], speed: [10, 30] },
    rain: { label: 'Rain', icon: '🌧️', motion: 'fall', look: 'rain', count: 120, size: [10, 22], speed: [380, 600] },
    sparkles: { label: 'Sparkles', icon: '✨', motion: 'twinkle', look: 'emoji', chars: ['✨'], count: 26, size: [14, 26] },
    fruits: { label: 'Fruits', icon: '🍉', motion: 'fall', look: 'emoji', chars: ['🍓', '🍒', '🍉', '🍊', '🍍', '🥝', '🍇'], count: 22, size: [20, 34], speed: [30, 65], spin: 1.2 },
    candy: { label: 'Candy', icon: '🍭', motion: 'fall', look: 'emoji', chars: ['🍬', '🍭', '🍩', '🧁', '🍪'], count: 20, size: [20, 34], speed: [30, 60], spin: 1.2 },
    study: { label: 'Study', icon: '🎓', motion: 'rise', look: 'emoji', chars: ['📚', '✏️', '🎓', '📝', '📐', '💡'], count: 18, size: [20, 32], speed: [15, 35], spin: 0.4 },
    music: { label: 'Music', icon: '🎵', motion: 'rise', look: 'emoji', chars: ['🎵', '🎶'], count: 20, size: [18, 30], speed: [25, 50], spin: 0.4 },
    space: { label: 'Space', icon: '🚀', motion: 'wander', look: 'emoji', chars: ['🚀', '🪐', '🌙', '☄️', '⭐'], count: 12, size: [22, 36], speed: [15, 35] },
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Emoji are drawn once into small canvases and then copied, which is much faster
  const sprites = new Map();
  function sprite(char, px) {
    const key = char + '|' + px;
    if (!sprites.has(key)) {
      const c = document.createElement('canvas');
      c.width = c.height = Math.ceil(px * 1.4);
      const g = c.getContext('2d');
      g.font = `${px}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(char, c.width / 2, c.height / 2 + px * 0.05);
      sprites.set(key, c);
    }
    return sprites.get(key);
  }

  function makeParticle(v, w, h, scatter) {
    const size = Math.round(rand(v.size[0], v.size[1]));
    const x = rand(0, w);
    let y = rand(0, h);
    if (!scatter && v.motion === 'fall') y = -size * 2;
    if (!scatter && v.motion === 'rise') y = h + size * 2;
    return {
      x, y, baseX: x, size,
      speed: v.speed ? rand(v.speed[0], v.speed[1]) : 0,
      char: v.chars ? pick(v.chars) : '',
      color: pick(CONFETTI_COLORS),
      angle: rand(0, Math.PI * 2),
      spin: v.spin ? rand(-v.spin, v.spin) : 0,
      phase: rand(0, Math.PI * 2),
      sway: v.look === 'rain' ? 0 : rand(10, 30),
      swaySpeed: rand(0.5, 1.5),
      dir: rand(0, Math.PI * 2),
    };
  }

  function mount(host, name, mode = 'fixed') {
    const v = LIST[name];
    if (!v || !v.motion) return { stop() {} };

    const layer = document.createElement('div');
    layer.className = `visual-layer visual-${mode}`;
    layer.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    layer.appendChild(canvas);
    host.prepend(layer);
    const ctx = canvas.getContext('2d');
    const accent = getComputedStyle(host).getPropertyValue('--t-accent').trim() || '#5b3fd6';

    let w = 0, h = 0, dpr = 1, t = 0, last = 0, raf = 0, stopped = false;
    let particles = [];
    let shooting = null;
    let nextShooting = rand(2, 5);

    function resize() {
      const rect = layer.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fewer things on small screens, more on big ones
      const target = Math.round(v.count * Math.min(1.8, Math.max(0.4, (w * h) / (1280 * 720))));
      while (particles.length < target) particles.push(makeParticle(v, w, h, true));
      particles.length = target;
      draw(); // show something at once, even before the first animation frame
    }

    function update(dt) {
      for (const p of particles) {
        p.angle += p.spin * dt;
        if (v.motion === 'fall' || v.motion === 'rise') {
          p.y += (v.motion === 'fall' ? 1 : -1) * p.speed * dt;
          p.x = p.baseX + Math.sin(t * p.swaySpeed + p.phase) * p.sway;
          if (v.look === 'rain') p.baseX -= p.speed * 0.12 * dt;
          const gone = v.motion === 'fall' ? p.y - p.size * 2 > h : p.y + p.size * 2 < 0;
          if (gone || p.baseX < -60) Object.assign(p, makeParticle(v, w + 60, h, false));
        } else if (v.motion === 'wander') {
          p.dir += rand(-1, 1) * dt * 1.5;
          p.x += Math.cos(p.dir) * p.speed * dt;
          p.y += Math.sin(p.dir) * p.speed * dt;
          if (p.x < -p.size) p.x = w + p.size;
          if (p.x > w + p.size) p.x = -p.size;
          if (p.y < -p.size) p.y = h + p.size;
          if (p.y > h + p.size) p.y = -p.size;
        }
      }
      if (v.shooting) {
        nextShooting -= dt;
        if (!shooting && nextShooting <= 0) {
          shooting = { x: rand(w * 0.2, w), y: rand(0, h * 0.4), life: 1 };
          nextShooting = rand(3, 7);
        }
        if (shooting) {
          shooting.x -= 700 * dt;
          shooting.y += 300 * dt;
          shooting.life -= dt * 1.3;
          if (shooting.life <= 0) shooting = null;
        }
      }
    }

    function drawStar(p, alpha) {
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? p.size * 0.45 : p.size;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }

    function drawOne(p) {
      let alpha = 1;
      if (v.motion === 'twinkle') alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * p.swaySpeed * 2 + p.phase));
      ctx.globalAlpha = alpha;

      switch (v.look) {
        case 'emoji': {
          const s = p.size;
          const img = sprite(p.char, Math.round(s * dpr));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.spin ? p.angle : Math.sin(t + p.phase) * 0.15);
          ctx.drawImage(img, -s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
          ctx.restore();
          break;
        }
        case 'bubble': {
          const r = p.size / 2;
          const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
          g.addColorStop(0, 'rgba(255,255,255,0.55)');
          g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
          g.addColorStop(1, 'rgba(255,255,255,0.25)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.35;
          ctx.stroke();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.7, Math.PI * 1.1, Math.PI * 1.45);
          ctx.stroke();
          break;
        }
        case 'star':
          drawStar(p, alpha);
          break;
        case 'snow':
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.strokeStyle = 'rgba(116,192,252,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.scale(1, Math.cos(p.angle * 1.7));
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size * 0.22, p.size, p.size * 0.45);
          ctx.restore();
          break;
        case 'glow': {
          const pulse = 0.5 + 0.5 * Math.sin(t * 2 * p.swaySpeed + p.phase);
          const r = p.size * 5;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, `rgba(255,236,140,${0.9 * pulse + 0.1})`);
          g.addColorStop(0.3, `rgba(255,212,59,${0.35 * pulse})`);
          g.addColorStop(1, 'rgba(255,212,59,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'rain':
          ctx.strokeStyle = 'rgba(100,160,230,0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.size * 0.12, p.y - p.size);
          ctx.stroke();
          break;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) drawOne(p);
      if (shooting) {
        const g = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x + 140, shooting.y - 60);
        g.addColorStop(0, `rgba(255,255,255,${shooting.life})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(shooting.x, shooting.y);
        ctx.lineTo(shooting.x + 140, shooting.y - 60);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (stopped) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(layer);
    resize();
    // People who ask their system for less motion get a still picture
    if (!reducedMotion) raf = requestAnimationFrame(frame);

    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        layer.remove();
      },
    };
  }

  return { LIST, mount };
})();
