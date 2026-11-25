/* Real-coordinate overlays for the local orthographic city projection. */
(() => {
  'use strict';
  const colors={fault:'#ff9477',cumulative:'#ffe181',rate:'#8ff1fe',station:'#f1c5ff'};
  const groupNames={cumulative:'累積量',rate:'年平均',station:'測站'};

  function prepare(locate){
    const faults=window.MapFaults, source=faults?.source;
    const faultRows=(faults?.outlines||[]).map(z=>({
      key:z.code,label:z.name,tag:z.name,kind:'fault',
      detail:z.name+'（'+z.code+'）'+(z.date?' · '+z.date+' 公告':'')+' · 色帶依公告邊界繪製',
      parts:[z.ring.map(locate)]
    }));
    const groups={};
    for(const kind of Object.keys(groupNames)){
      const rows=new Map(), periods=new Set();
      for(const f of window.MapSubsidence?.features||[]){
        const p=f.properties,g=f.geometry;
        if(!p||p.kind!==kind||!g)continue;
        const coords=g.type==='Point'?[[g.coordinates]]:g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
        if(!coords.length)continue;
        const key=kind+'-'+(kind==='station'?p.label:p.value);
        const unit=p.unit||'', label=p.label;
        const tag=kind==='station'?label.split(/\s+GNSS\s+/)[0]+'測站':p.value+unit;
        const row=rows.get(key)||{key,label,kind,tag,value:p.value,source:p.sourceUrl,parts:[]};
        row.detail=[p.period,label].filter(Boolean).join(' · ');
        coords.forEach(line=>{if(line.length)row.parts.push(line.map(locate));});
        rows.set(key,row);if(p.period)periods.add(p.period);
      }
      const entries=[...rows.values()].sort((a,b)=>a.value-b.value);
      const title={cumulative:'累積下陷量等值線',rate:'年平均下陷速率等值線',station:'GNSS 固定測站'}[kind];
      const values=entries.map(r=>r.value).filter(Number.isFinite);
      const caption=entries.length?(kind==='station'?entries[0].label+'，數值為當日觀測高程。':
        ('線值 '+values.join('、')+(kind==='rate'?' 公分／年':' 公分')+'，點線查看，線間未推估。')):'本次未載入此項資料。';
      groups[kind]={kind,rows:entries,title,caption,source:'經濟部水利署',url:entries[0]?.source,date:[...periods].join('、')};
    }
    return {fault:{kind:'fault',rows:faultRows,title:'活動斷層地質敏感區',
      caption:faultRows.length?'橘色帶為 '+faultRows.length+' 處已公告範圍，點選名稱可看公告日期。':'本次未載入公告範圍。',
      source:'地質調查及礦業管理中心',url:source?.sourceUrl,date:source?.checked?'圖資核對 '+source.checked:''},subsidence:groups};
  }
  function middle(points){
    let length=0;
    const lengths=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      length+=Math.hypot(b.x-a.x,b.y-a.y);lengths.push(length);
    }
    const index=lengths.findIndex(l=>l>=length/2);
    return {point:points[Math.max(0,index+1)],length};
  }
  function draw(ctx,info,project,view){
    const hits=[], candidates=[], labels=[];
    const active=view.focusedFeature;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(const row of info.rows){
      const focused=row.key===active, dimmed=active&&!focused;
      const color=colors[row.kind], closed=row.kind==='fault';
      let largest=null;
      for(const part of row.parts){
        const pts=part.map(project), head=pts[0];if(!head)continue;
        const mid=middle(pts);if(!largest||mid.length>largest.length)largest=mid;
        const bbox=pts.reduce((b,p)=>[Math.min(b[0],p.x),Math.min(b[1],p.y),Math.max(b[2],p.x),Math.max(b[3],p.y)],[head.x,head.y,head.x,head.y]);
        if(bbox[2]<-10||bbox[3]<-10||bbox[0]>view.width+10||bbox[1]>view.height+10)continue;
        const path=new Path2D();
        ctx.globalAlpha=dimmed ? .48 : 1;
        if(row.kind==='station'){
          path.arc(head.x,head.y,5.4,0,2*Math.PI);
          ctx.fillStyle=color;ctx.fill(path);ctx.strokeStyle='#432e53';ctx.lineWidth=2.6;ctx.stroke(path);
        }else{
          path.moveTo(head.x,head.y);for(let i=1;i<pts.length;i++)path.lineTo(pts[i].x,pts[i].y);
          if(closed){path.closePath();ctx.fillStyle=color;ctx.fill(path);}
          ctx.strokeStyle=closed?'#6e333e':row.kind==='rate'?'#1b565d':'#76532f';
          ctx.lineWidth=closed?(focused?3.7:3.0):(focused?4.8:3.4);ctx.stroke(path);
          ctx.strokeStyle=color;ctx.lineWidth=closed?1.2:focused?2.9:1.65;ctx.stroke(path);
        }
        hits.push({row,pts,bbox,closed,path});
      }
      if(largest)candidates.push({row,...largest});
    }
    ctx.globalAlpha=1;
    candidates.sort((a,b)=>Number(b.row.key===active)-Number(a.row.key===active)||b.length-a.length);
    const limit=info.kind==='fault'?4:view.compact?3:6;
    ctx.font='600 '+(view.compact?10:12)+'px "Microsoft JhengHei",system-ui,sans-serif';
    ctx.textBaseline='middle';
    for(const item of candidates){
      if(labels.length>=limit)break;
      const {row,point}=item;
      if(point.x<0||point.y<view.top-4||point.x>view.width||point.y>view.bottom+4)continue;
      const w=ctx.measureText(row.tag).width+13,h=view.compact?19:23;
      const gap=view.compact?11:16;
      const placements=[[gap,-21],[-w-gap,9],[gap,7],[-w-gap,-25],[gap,-43],[-w-gap,27],[gap,32]];
      let rect;
      for(const [dx,dy] of placements){
        const x=point.x+dx,y=point.y+dy;
        if(x<4||x+w>view.width-4||y<view.top-6||y+h>view.bottom+6)continue;
        const candidate=[x,y,x+w,y+h];
        if(labels.some(l=>x<l[2]+3&&x+w>l[0]-3&&y<l[3]+3&&y+h>l[1]-3))continue;
        rect=candidate;break;
      }
      if(!rect)continue;
      labels.push(rect);
      const [x,y,r,b]=rect,end=Math.abs(point.x-x)<Math.abs(point.x-r)?x:r;
      ctx.strokeStyle='#213540';ctx.lineWidth=1.8;
      ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(end,y+h/2);ctx.stroke();
      ctx.fillStyle='#13303e';ctx.fillRect(x,y,w,h);
      ctx.fillStyle=colors[row.kind];ctx.fillRect(x,y,2,h);
      ctx.fillStyle='#fffaf0';ctx.fillText(row.tag,x+7,(y+b)/2+.5);
      hits.push({row,rect});
    }
    ctx.restore();return {hits,labels};
  }
  function pick(hits,p){
    let nearest=null,best=8*8;
    for(let i=hits.length-1;i>=0;i--){
      const h=hits[i];
      if(h.rect){
        if(p.x>=h.rect[0]&&p.y>=h.rect[1]&&p.x<=h.rect[2]&&p.y<=h.rect[3])return h.row;
        continue;
      }
      const [l,t,r,b]=h.bbox;
      if(p.x<l-8||p.x>r+8||p.y<t-8||p.y>b+8)continue;
      let inside=false;
      for(let j=0;j<h.pts.length;j++){
        const a=h.pts[j],z=h.pts[Math.min(j+1,h.pts.length-1)];
        const dx=z.x-a.x,dy=z.y-a.y,den=dx*dx+dy*dy;
        const u=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
        const dist=(p.x-a.x-u*dx)**2+(p.y-a.y-u*dy)**2;
        if(dist<=best){best=dist;nearest=h.row;}
        if(h.closed&&(a.y>p.y)!==(z.y>p.y)&&p.x<(z.x-a.x)*(p.y-a.y)/(z.y-a.y)+a.x)inside=!inside;
      }
      if(inside)return h.row;
    }
    return nearest;
  }
  window.CityGeoLayers={prepare,draw,pick,groupNames};
})();
