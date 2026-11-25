/* Orthographic floor diagram. Geometry and window divisions are schematic.
   The world axes are east (x), north (y) and up (z). */
(() => {
  'use strict';

  const mounts = new WeakMap();
  const radians = Math.PI / 180;
  const initialView = { yaw: 145, tilt: 25 };
  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
  const floorName = number => number < 0 ? `地下 ${-number} 樓` : `${number} 樓`;
  const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
  const compassName = azimuth => directions[Math.round(azimuth / 45) % 8];
  const icons = {
    left: '<path d="m14 5-7 7 7 7"/>',
    right: '<path d="m10 5 7 7-7 7"/>',
    up: '<path d="m5 15 7-7 7 7"/>',
    down: '<path d="m5 9 7 7 7-7"/>',
    reset: '<path d="M4 11a8 8 0 1 1 1.8 6M4 5v6h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

  function positiveTotal(value) {
    const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    return Number.isSafeInteger(n) && n > 0 && n <= 200 ? n : null;
  }

  function inside(point, polygon) {
    let within = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) within = !within;
    }
    return within;
  }

  function mount(root, options = {}) {
    mounts.get(root)?.destroy();
    const floors = positiveTotal(options.floors);
    const observations = new Set((Array.isArray(options.observedFloors) ? options.observedFloors : [])
      .filter(n => Number.isSafeInteger(n) && n !== 0));
    const available = new Set(observations);
    for (let floor = 1; floor <= (floors || 0); floor++) available.add(floor);
    const levels = Array.from(available).sort((a, b) => a - b);
    const modelLevels = floors ? Array.from({length: floors}, (_, i) => i + 1) : levels.filter(n => n > 0);
    const separated = !floors && modelLevels.length > 0;
    const wrapper = document.createElement('section');
    wrapper.className = 'bscene';
    wrapper.setAttribute('aria-label', `${options.name || '社區'}樓層立體示意`);
    wrapper.innerHTML = `
      <div class="bscene-view">
        <canvas class="bscene-canvas" aria-label="樓層立體示意，左右鍵旋轉，上下鍵調整仰角，上一頁與下一頁鍵選樓，Home 鍵重設視角"></canvas>
        <div class="bscene-stamp"><i aria-hidden="true"></i><span></span></div>
        <div class="bscene-empty" hidden><strong>總樓層待補</strong><p></p></div>
        <span class="bscene-view-tip"></span>
      </div>
      <div class="bscene-tools">
        <label class="bscene-picker"><span>選取樓層</span><select aria-label="選取示意樓層"></select></label>
        <div class="bscene-orbit" role="group" aria-label="調整模型視角"></div>
      </div>
      <div class="bscene-sun">
        <div class="bscene-sun-head"><strong>${icon('sun')}太陽方位</strong><span class="bscene-bearing"></span></div>
        <div class="bscene-sun-fields"><label>日期<input class="bscene-date" type="date" aria-label="太陽方位日期"></label>
          <label class="bscene-time-field"><span>臺灣時間 <output></output></span><input type="range" min="0" max="1439" step="1" value="840" aria-label="太陽方位時間"></label>
        </div>
      </div>
      <p class="bscene-note"></p>`;
    root.replaceChildren(wrapper);
    const $ = selector => wrapper.querySelector(selector);
    const canvas = $('.bscene-canvas'), ctx = canvas.getContext('2d');
    const viewport = $('.bscene-view'), select = $('select'), orbit = $('.bscene-orbit');
    const empty = $('.bscene-empty'), tip = $('.bscene-view-tip');
    const date = $('.bscene-date'), time = $('input[type="range"]'), timeLabel = $('output');
    const bearing = $('.bscene-bearing');
    date.value = window.MapSun?.today() || new Date(Date.now() + 28800000).toISOString().slice(0, 10);
    const hasPosition = Boolean(window.MapSun?.position(options.lat, options.lon, date.value, '12:00'));
    const canRotate = Boolean(ctx && (modelLevels.length || hasPosition));
    $('.bscene-stamp span').textContent = floors ? `地上 ${floors} 層` : (separated ? '已揭露樓層' : '樓層資料');
    empty.hidden = Boolean(modelLevels.length && ctx);
    if (!empty.hidden) {
      if (modelLevels.length) empty.querySelector('strong').textContent = '樓層清單';
      empty.querySelector('p').textContent = levels.length ? '從下方選單查看樓層紀錄。' : '目前資料也沒有可定位的單一樓層。';
    }
    canvas.tabIndex = canRotate ? 0 : -1;
    canvas.classList.toggle('bscene-can-orbit', canRotate);
    const markedLevels = floors && modelLevels.some(n => observations.has(n));
    tip.textContent = ctx && modelLevels.length
      ? (markedLevels ? '拖曳旋轉・點選樓層　綠點為有紀錄樓層' : '拖曳旋轉・點選樓層')
      : (canRotate ? '拖曳旋轉方位盤' : '');
    $('.bscene-note').textContent = floors
      ? '以等樓高繪製量體，窗格僅供辨識樓層。實際外觀、棟向與周邊遮蔽須現場查證。'
      : (separated ? '總層數未確認，僅列已揭露樓層。樓板等距分開，間距、窗格和棟向均為示意。' : '總層數待取得，成交樓層依原始紀錄呈現。');
    select.add(new Option(levels.length ? '選擇樓層' : '沒有可選樓層', ''));
    for (const n of [...levels].reverse()) {
      const suffix = observations.has(n) ? (floors && (n > floors || n < 0) ? '・僅見紀錄' : '・有紀錄') : '';
      select.add(new Option(floorName(n) + suffix, String(n)));
    }
    select.disabled = !levels.length;
    const state = {...initialView, selected: null, hover: null, hit: [], sun: null};
    let frame = 0, dead = false, pointer = null;
    const abort = new AbortController();
    const listen = (node, type, fn) => node.addEventListener(type, fn, {signal: abort.signal});

    function renderSoon() {
      if (ctx && !frame && !dead) frame = requestAnimationFrame(() => { frame = 0; draw(); });
    }
    function setFloor(number) {
      state.selected = available.has(number) ? number : null;
      select.value = state.selected === null ? '' : String(state.selected);
      renderSoon();
    }
    function choose(number) {
      setFloor(number);
      options.onFloorSelect?.(state.selected);
    }
    function rotate(yawChange, tiltChange) {
      state.yaw = (state.yaw + yawChange + 360) % 360;
      state.tilt = clamp(state.tilt + tiltChange, 9, 62);
      renderSoon();
    }
    function reset() {
      Object.assign(state, initialView);
      renderSoon();
    }
    for (const [key, title, action] of [
      ['left', '向左旋轉', () => rotate(-15, 0)], ['right', '向右旋轉', () => rotate(15, 0)],
      ['up', '提高視角', () => rotate(0, 7)], ['down', '降低視角', () => rotate(0, -7)],
      ['reset', '重設視角', reset]
    ]) {
      const button = document.createElement('button');
      button.type = 'button'; button.title = title; button.setAttribute('aria-label', title);
      button.innerHTML = icon(key);
      orbit.append(button); listen(button, 'click', action);
    }
    orbit.hidden = !canRotate;
    listen(select, 'change', () => choose(select.value === '' ? null : Number(select.value)));
    function changeSun() {
      const minute = Number(time.value);
      const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      timeLabel.textContent = clock;
      time.setAttribute('aria-valuetext', clock);
      state.sun = window.MapSun?.position(options.lat, options.lon, date.value, clock) || null;
      if (!hasPosition) bearing.textContent = '缺少可用座標';
      else if (!state.sun) bearing.textContent = '請選擇有效日期';
      else {
        const { azimuth, elevation } = state.sun;
        const direction = azimuth === null ? '天頂' : `${compassName(azimuth)} ${Math.round(azimuth) % 360}°`;
        bearing.textContent = elevation <= 0 ? `地平線下・${direction}` : `${direction}・仰角 ${Math.round(elevation)}°`;
      }
      renderSoon();
    }
    function getSun() {
      return {date: date.value, time: timeLabel.textContent};
    }
    function setSun(value = {}) {
      if (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
        const before = date.value;
        date.value = value.date;
        if (!date.value) date.value = before;
      }
      if (typeof value.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
        const [hours, minutes] = value.time.split(':').map(Number);
        time.value = String(hours * 60 + minutes);
      }
      changeSun();
    }
    $('.bscene-sun-fields').hidden = !hasPosition;
    const inputSun = () => { changeSun(); options.onSunChange?.(getSun()); };
    listen(date, 'input', inputSun); listen(time, 'input', inputSun);
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    }
    function floorAt(p) {
      for (let i = state.hit.length - 1; i >= 0; i--) {
        if (inside(p, state.hit[i].polygon)) return state.hit[i].floor;
      }
      return null;
    }
    if (canRotate) {
      listen(canvas, 'pointerdown', event => {
        if (pointer || event.button !== 0) return;
        const p = point(event);
        pointer = { id: event.pointerId, start: p, last: p, moved: false };
        canvas.setPointerCapture(event.pointerId);
      });
      listen(canvas, 'pointermove', event => {
        const p = point(event);
        if (!pointer) {
          const hover = floorAt(p);
          if (hover !== state.hover) { state.hover = hover; renderSoon(); }
          return;
        }
        if (pointer.id !== event.pointerId) return;
        if (!pointer.moved && Math.hypot(p.x - pointer.start.x, p.y - pointer.start.y) < 5) return;
        pointer.moved = true; state.hover = null;
        canvas.classList.add('bscene-dragging');
        rotate(-(p.x - pointer.last.x) * 0.55, (p.y - pointer.last.y) * 0.28);
        pointer.last = p;
      });
      function release() {
        pointer = null; state.hover = null; canvas.classList.remove('bscene-dragging'); renderSoon();
      }
      listen(canvas, 'pointerup', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        const floor = pointer.moved ? null : floorAt(point(event));
        release();
        if (floor !== null) choose(floor);
      });
      listen(canvas, 'lostpointercapture', release);
      listen(canvas, 'pointercancel', release);
      listen(canvas, 'pointerleave', () => { if (!pointer) { state.hover = null; renderSoon(); } });
      listen(canvas, 'keydown', event => {
        const i = levels.indexOf(state.selected);
        switch (event.key) {
          case 'ArrowLeft': rotate(-12, 0); break;
          case 'ArrowRight': rotate(12, 0); break;
          case 'ArrowUp': rotate(0, 6); break;
          case 'ArrowDown': rotate(0, -6); break;
          case 'Home': reset(); break;
          case 'PageUp': if (levels.length) choose(levels[clamp(i + 1, 0, levels.length - 1)]); break;
          case 'PageDown': if (levels.length) choose(levels[i < 0 ? levels.length - 1 : Math.max(0, i - 1)]); break;
          default: return;
        }
        event.preventDefault();
      });
    }

    function draw() {
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const yaw = state.yaw * radians, tilt = state.tilt * radians;
      const sy = Math.sin(yaw), cy = Math.cos(yaw), st = Math.sin(tilt), ct = Math.cos(tilt);
      const hx = 19, hy = 12, step = separated ? 7.4 : 3.6;
      const thickness = separated ? 1.6 : step;
      const top = modelLevels.length ? (modelLevels.length - 1) * step + thickness : 0;
      const groundRadius = 33;
      const worldHalfWidth = Math.abs(cy) * hx + Math.abs(sy) * hy;
      const depth = (Math.abs(sy) * hx + Math.abs(cy) * hy) * st;
      const upper = Math.max(top * ct + depth + 1.5, hasPosition ? groundRadius + 2 : groundRadius * st);
      const lower = groundRadius * st + 1;
      const scale = Math.min(w * 0.70 / (2 * worldHalfWidth + 6), (h - 76) / (upper + lower), h * .016);
      const centreX = w * .5, centreY = 40 + (h - 76 - (upper + lower) * scale) / 2 + upper * scale;
      const proj = (x, y, z = 0) => ({
        x: centreX + (-x * cy + y * sy) * scale,
        y: centreY + ((x * sy + y * cy) * st - z * ct) * scale
      });
      function path(points, closed = false) {
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        if (closed) ctx.closePath();
      }
      function stroke(points, color, width = 1) {
        path(points); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      }
      function polygon(points, fill, edge, width = 1) {
        path(points, true);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = width; ctx.stroke(); }
      }
      function dot(p, radius, color) {
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      }
      const corners = (x, y, z) => [[-x,-y],[x,-y],[x,y],[-x,y]].map(([a,b]) => proj(a,b,z));
      const font = 'system-ui, "Microsoft JhengHei", sans-serif';
      function label(content, p, color, size, align = 'center') {
        ctx.font = `600 ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillText(content, p.x, p.y);
      }

      // Survey grid and compass ticks live in the ground plane.
      const span = Math.min(900, Math.max(w, h) / scale * 1.8);
      const grid = Math.max(6, Math.round(23 / scale));
      for (let n = -Math.ceil(span / grid); n <= Math.ceil(span / grid); n++) {
        const u = n * grid, ink = n % 4 === 0 ? '#54838a34' : '#52777d21';
        stroke([proj(u,-span), proj(u,span)], ink, .7);
        stroke([proj(-span,u), proj(span,u)], ink, .7);
      }
      const polar = (radius, a) => proj(radius * Math.sin(a), radius * Math.cos(a));
      const ring = Array.from({length:121}, (_, i) => polar(groundRadius, i * Math.PI / 60));
      stroke(ring, '#69a4a46b', .95);
      for (let degree = 0; degree < 360; degree += 5) {
        const a = degree * radians, major = degree % 45 === 0;
        stroke([polar(groundRadius + .1, a), polar(groundRadius + (major ? 1.75 : .65), a)], major ? '#7fb4af9c' : '#6994946b', major ? 1.1 : .65);
      }
      if (state.sun && state.sun.elevation > 0 && state.sun.azimuth !== null) {
        const a = state.sun.azimuth * radians;
        const tip = polar(groundRadius, a), tail = polar(groundRadius * .6, a);
        ctx.setLineDash([3, 4]); stroke([tail, tip], '#ffc779', 1.2); ctx.setLineDash([]);
        dot(tip, 7, '#edb15c34'); dot(tip, 3.5, '#ffd990');
      }
      const [north, east] = [0, 90].map(d => polar(groundRadius + 3, d * radians));
      if (north.x > 12 && north.x < w - 12 && north.y < h - 12) label('北', north, '#9ccac5', 10);
      if (east.x > 12 && east.x < w - 12 && east.y < h - 12) label('東', east, '#91abae', 10);
      // Project a constant-radius celestial arc between the horizon and the
      // calculated solar altitude. It expresses direction, not a site shadow.
      if (state.sun?.elevation > 0 && state.sun.azimuth !== null) {
        const az = state.sun.azimuth * radians, el = state.sun.elevation * radians;
        const sky = angle => proj(groundRadius*Math.sin(az)*Math.cos(angle),
          groundRadius*Math.cos(az)*Math.cos(angle),groundRadius*Math.sin(angle));
        const arc = Array.from({length:19}, (_,i) => sky(el*i/18));
        ctx.setLineDash([2,3]); stroke(arc,'#ffd0939c',1); ctx.setLineDash([]);
        const sun = sky(el);
        const glow = ctx.createRadialGradient(sun.x,sun.y,.5,sun.x,sun.y,13);
        glow.addColorStop(0,'#ffc88173'); glow.addColorStop(1,'#f7b76a00');
        dot(sun,13,glow); dot(sun,3.1,'#ffe9b0');
        for (let i = 0; i < 8; i++) {
          const a = i*Math.PI/4;
          stroke([{x:sun.x+Math.sin(a)*5.6,y:sun.y+Math.cos(a)*5.6},
            {x:sun.x+Math.sin(a)*7.5,y:sun.y+Math.cos(a)*7.5}],'#ffe4a3df',.8);
        }
      }

      const hits = [];
      if (modelLevels.length) {
        const faces = [
          {axis:'y', sign:-1, half:hx, side:hy, n:-cy}, {axis:'x', sign:1, half:hy, side:hx, n:sy},
          {axis:'y', sign:1, half:hx, side:hy, n:cy}, {axis:'x', sign:-1, half:hy, side:hx, n:-sy}
        ].filter(f => f.n > 0.0001);
        function onFace(face, u, z, expand = 0) {
          const side = face.sign * (face.side + expand);
          return face.axis === 'x' ? proj(side, u, z) : proj(u, side, z);
        }
        function faceQuad(f, u0, u1, z0, z1, expand = 0) {
          return [onFace(f,u0,z0,expand), onFace(f,u1,z0,expand), onFace(f,u1,z1,expand), onFace(f,u0,z1,expand)];
        }
        polygon(corners(hx + 2.0,hy + 2.0,0), '#152a36', '#8fb4b285', .9);
        polygon(corners(hx + 1.1,hy + 1.1,.32), '#39515c', '#9cbfbd80', .65);
        function drawLid(z, selected, isRoof) {
          const lid = corners(hx+.23,hy+.23,z);
          const lidGrad = ctx.createLinearGradient(lid[0].x,lid[0].y,lid[2].x+.01,lid[2].y);
          lidGrad.addColorStop(0, selected ? '#997044' : '#4c696e');
          lidGrad.addColorStop(.5, selected ? '#d4a964' : '#759295');
          lidGrad.addColorStop(1, selected ? '#a17a4c' : '#4e6f77');
          polygon(lid, lidGrad, selected ? '#ffe3a0' : '#b5d4ce', 1.1);
          polygon(corners(hx-1,hy-1,z+.04), isRoof ? '#49616a75' : '#304b551f', selected ? '#ffd594' : '#bad3cc98', .75);
          for (let x = -hx + 5; x < hx - 1; x += 5) stroke([proj(x,-hy+1,z+.06), proj(x,hy-1,z+.06)], '#b6d4cf48', .6);
          for (let y = -hy + 5; y < hy - 1; y += 5) stroke([proj(-hx+1,y,z+.06), proj(hx-1,y,z+.06)], '#d2e3d943', .6);
          return lid;
        }
        for (const [index,n] of modelLevels.entries()) {
          const base = index * step, cap = base + thickness, selected = n === state.selected, hover = n === state.hover;
          for (const f of faces) {
            const broad = f.axis === 'y', face = faceQuad(f, -f.half, f.half, base, cap);
            const gradient = ctx.createLinearGradient(face[0].x,face[0].y,face[1].x + .01,face[1].y);
            const flank = f.n;
            if (selected || hover) {
              gradient.addColorStop(0, selected ? '#a86430' : '#40656a');
              gradient.addColorStop(.55, selected ? '#ffe3a2' : '#86adab');
              gradient.addColorStop(1, selected ? '#bb7933' : '#406d73');
            } else {
              const light = Math.round(14 + 11 * flank + 5 * ((index+1) / modelLevels.length));
              gradient.addColorStop(0, `hsl(199,32%,${light}%)`);
              gradient.addColorStop(.46, `hsl(191,34%,${light + 8}%)`);
              gradient.addColorStop(1, `hsl(202,37%,${light - 4}%)`);
            }
            polygon(face, gradient);
            const frame = selected ? '#ffeece' : (hover ? '#91bcbb' : '#91b9bd');
            const panes = broad ? 8 : 5;
            for (let i = 0; i < panes; i++) {
              const u0 = -f.half + (2 * f.half / panes) * i, u1 = u0 + 2 * f.half / panes;
              const window = faceQuad(f,u0 + .38,u1 - .38,base + .58,cap - .62);
              const pane = ctx.createLinearGradient(window[0].x,window[0].y,window[2].x+.01,window[2].y);
              pane.addColorStop(0, selected ? '#4a342b4d' : '#0d202f7a');
              pane.addColorStop(.72, selected ? '#fff0bd62' : (i % 3 === 0 ? '#b8e9e04a' : '#9fd8de29'));
              pane.addColorStop(1, selected ? '#fff4c988' : '#badcda55');
              polygon(window, pane);
              stroke([onFace(f,u0,base + .35),onFace(f,u0,cap - .4)], selected ? '#755839' : '#122d38', Math.max(.45,scale * .14));
            }
            polygon(faceQuad(f,-f.half-.22,f.half+.22,cap-.38,cap,.23), selected ? '#ffdb90' : '#57757c');
            stroke([onFace(f,-f.half-.22,cap,.23),onFace(f,f.half+.22,cap,.23)], frame, selected ? 1.45 : .70);
            stroke([onFace(f,-f.half,base),onFace(f,-f.half,cap)], selected ? '#ffdd8e' : '#b1cecc88', .8);
            stroke([onFace(f,f.half,base),onFace(f,f.half,cap)], selected ? '#ffdd8e' : '#b1cecc88', .8);
            hits.push({floor:n, polygon:face});
          }
          if (separated || index === modelLevels.length - 1) hits.push({floor:n, polygon:drawLid(cap, selected, !separated)});
        }
        const active = state.selected ?? state.hover;
        if (markedLevels) {
          for (const n of observations) {
            if (n < 1 || n > floors || n === active) continue;
            const edge = corners(hx+.4,hy+.4,(n-.5)*step).reduce((left,p) => left.x < p.x ? left : p);
            dot({x:edge.x-4.2,y:edge.y},3,'#182e39');
            dot({x:edge.x-4.2,y:edge.y},1.7,'#aeedce');
          }
        }
        const labelled = separated && modelLevels.length <= 5 ? modelLevels : [active];
        for (const n of labelled) {
          const index = modelLevels.indexOf(n);
          if (index < 0) continue;
          const edge = corners(hx+.4,hy+.4,index*step+thickness/2).reduce((best,p) => best.x > p.x ? best : p);
          const text = floorName(n), accent = n === state.selected ? '#ffcc78' : '#9dd4cc';
          const right = Math.min(w - 9, edge.x + Math.max(46, Math.min(94,w*.15))), end = right - 40;
          const y = clamp(edge.y-12, 49, h-33);
          if (end > edge.x + 5) {
            stroke([edge,{x:edge.x+5,y:edge.y},{x:end-3,y}],accent,.95);
            dot(edge,2,accent);
            ctx.fillStyle = '#12232df2'; ctx.fillRect(end,y-9,40,18);
            label(text,{x:end+20,y},accent,11);
          }
        }
      }
      state.hit = hits;

      // Upper compass stays visible even if a tower covers its ground-plane north mark.
      const cx = w - 28, py = 33, a = { x: sy, y: cy * st };
      const len = Math.hypot(a.x, a.y);
      const nx = a.x / len, ny = a.y / len, px = -ny * 3.2, dy = nx * 3.2;
      ctx.beginPath(); ctx.arc(cx,py,14,0,Math.PI*2); ctx.strokeStyle = '#81a5a86e'; ctx.lineWidth=.8; ctx.stroke();
      polygon([{x:cx+nx*11,y:py+ny*11},{x:cx+px,y:py+dy},{x:cx-px,y:py-dy}],'#9cdccc');
      polygon([{x:cx-nx*9,y:py-ny*9},{x:cx+px,y:py+dy},{x:cx-px,y:py-dy}],'#668086');
      label('北',{x:cx,y:py-22},'#b8cbc8',9);
    }
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(renderSoon) : null;
    if (resize) resize.observe(viewport); else listen(window,'resize',renderSoon);
    function destroy() {
      if (dead) return;
      dead = true; abort.abort(); resize?.disconnect(); cancelAnimationFrame(frame);
      wrapper.remove(); mounts.delete(root);
    }
    setFloor(options.selectedFloor);
    setSun(options.sun);
    const api = { setFloor, getSun, setSun, destroy };
    mounts.set(root, api);
    return api;
  }
  window.BuildingScene = Object.freeze({mount});
})();
